"""Analyse NHL 95 recorder-v3 runs into a reusable schema (preliminary until the full batch is in).

Usage:
  python analyze_runs.py "E:/emu/work/runs/G100-done/*.jsonl" "E:/emu/work/analysis/G100" --report "<repo>/analysis/G100-PRELIM.md"

Everything is derived from the raw recorder lines; no parameters are fitted. Outputs:
  games.csv        one row per game: id, config, period length, seed, state, goals, shots, exposure, validation flags
  shots.csv        one row per shot event: team, distance, angle, zone, shooter manpower state, outcome, rebound outcome
  goals.csv        one row per goal: time, scorer (if matched to a shot), manpower state of the scorer
  exposure.csv     game-clock seconds per (config, period type, team, manpower state)
  possession.csv   owned/loose possession segments (real seconds)
  stops.csv        stoppage codes per game (labels not yet decoded)
  figures/*.png    shot and possession heatmaps (PIL; no matplotlib in this environment)
  report.md        tables with bootstrap 95% CIs over games, percentiles, and validation checks

Definitions (schema is the same for Rink '95 and historical data):
  period type: REG = periods 1-3 (gsp 0-2), OT = gsp 3.
  team: 'home' / 'away'. Object indices 0-5 and 6-11 are the two teams; which group is home is inferred
        from shot counts and reported in validation.
  manpower state of a team: PP if it has more skaters on ice than the opponent, SH if fewer, EV otherwise.
  goal time: ScoreSum entries decode to (period, elapsed); remaining game clock = period length - elapsed.
  shot distance: feet from the attacked goal line, 3 units per foot; the goal sits at x = 0, y = +/-267.
  rates: per 60 game-minutes (or per 60 manpower minutes for state rates); 95% CI from games resampled
         with replacement (2000 draws, fixed seed).
"""
import argparse, bisect, csv, glob, math, os, random, collections
import json

FPS = 59.92
GOAL_Y = 267
BLUE_Y = 225          # blue line, assumed at 25 ft from the goal line (75 ft from centre); verify against the rink
DISTANCE_BINS = [(0, 10), (10, 20), (20, 30), (30, 40), (40, 60)]
ANGLE_BINS = [(0, 30), (30, 60), (60, 90)]
SAVE_WINDOW = 180      # frames (3 s) after a shot in which a goalie touch counts as the save
REBOUND_WINDOW = 180


def load_games(pattern):
    games = []
    for path in sorted(glob.glob(pattern)):
        cfg = os.path.basename(path).split('-s')[0]
        cur = []
        k = 0
        for line in open(path):
            r = json.loads(line)
            cur.append(r)
            if r['type'] == 'final':
                games.append(dict(id=f"{os.path.basename(path)[:-6]}#{k}", cfg=cfg, recs=cur, fin=r))
                cur = []
                k += 1
    return games


def wilson(k, n, z=1.96):
    if n == 0:
        return (float('nan'), float('nan'))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0, c - h), min(1, c + h))


def pct(xs, q):
    if not xs:
        return float('nan')
    xs = sorted(xs)
    i = (len(xs) - 1) * q
    lo, hi = math.floor(i), math.ceil(i)
    return xs[lo] + (xs[hi] - xs[lo]) * (i - lo)


def boot_rate(num, den, B=2000, seed=12345):
    """num, den: per-game lists. Returns (rate per 60 min, lo, hi) for sum(num)/sum(den)*60."""
    n = len(num)
    if n == 0 or sum(den) == 0:
        return (float('nan'), float('nan'), float('nan'))
    rng = random.Random(seed)
    point = sum(num) / sum(den) * 60
    draws = []
    for _ in range(B):
        idx = [rng.randrange(n) for _ in range(n)]
        d = sum(den[i] for i in idx)
        if d:
            draws.append(sum(num[i] for i in idx) / d * 60)
    draws.sort()
    return (point, draws[int(0.025 * len(draws))], draws[int(0.975 * len(draws)) - 1])


def fmt_rate(t):
    p, lo, hi = t
    if p != p:
        return '—'
    return f"{p:.2f} [{lo:.2f}, {hi:.2f}]"


def state_of(own, opp):
    return 'PP' if own > opp else ('SH' if own < opp else 'EV')


def derive(g, A_is_home):
    recs, fin = g['recs'], g['fin']
    P = fin['perTimeTotal']
    start = next((r for r in recs if r['type'] == 'start'), {})
    opts = next((r for r in recs if r['type'] == 'options'), {})
    per = [r for r in recs if r['type'] == 'gsp']
    cum = [(0, 0)] + [(q['home']['score'], q['away']['score']) for q in per]
    pgoals = [(cum[i + 1][0] - cum[i][0], cum[i + 1][1] - cum[i][1]) for i in range(len(per))]

    def team_of(grp):
        return ('home' if grp == 'A' else 'away') if A_is_home else ('away' if grp == 'A' else 'home')

    def grp_of(idx):
        return 'A' if idx < 6 else 'B'

    clocks = [r for r in recs if r['type'] == 'clock']
    cl_by_gsp = collections.defaultdict(list)
    for c in clocks:
        cl_by_gsp[c['gsp']].append(c)
    for k in cl_by_gsp:
        cl_by_gsp[k].sort(key=lambda c: c['clock'])
    cl_keys = {k: [c['clock'] for c in v] for k, v in cl_by_gsp.items()}

    def state_at(team, gsp, clock):
        lst = cl_by_gsp.get(gsp)
        if not lst:
            return 'EV'
        i = bisect.bisect_left(cl_keys[gsp], clock)
        cands = [lst[j] for j in (i - 1, i) if 0 <= j < len(lst)]
        c = min(cands, key=lambda c: abs(c['clock'] - clock))
        own, opp = (c['hmAp'], c['awAp']) if team == 'home' else (c['awAp'], c['hmAp'])
        return state_of(own, opp)

    shots = []
    for r in recs:
        if r.get('ev') in ('shot', 'ot'):           # 'ot' = one-timer shot (onetimershot routine)
            grp = grp_of(r['by'])
            team = team_of(grp)
            up = (team == 'home') == (r['gsp'] % 2 == 0)
            gy = GOAL_Y if up else -GOAL_Y
            dist = math.hypot(r['x'], r['y'] - gy) / 3
            ang = math.degrees(math.atan2(abs(r['x']), abs(gy - r['y'])))
            shots.append(dict(frame=r['frame'], gsp=r['gsp'], clock=r['clock'], x=r['x'], y=r['y'], by=r['by'],
                              kind=r['ev'], grp=grp, team=team, dist=dist, ang=ang,
                              state=state_at(team, r['gsp'], r['clock'])))
    touches = [dict(frame=r['frame'], grp=grp_of(r['g']), g=r['g']) for r in recs if r.get('ev') in ('gsave', 'gcon')]
    glues = [r for r in recs if r.get('ev') == 'glue']
    stops = [r for r in recs if r['type'] == 'stop']
    polls = [r for r in recs if r['type'] == 'poss']

    # goals from ScoreSum: (period index, elapsed) -> remaining game clock
    ss = fin['scoreSum']
    goals = []
    for i in range(0, len(ss), 6):
        w = (ss[i] << 8) | ss[i + 1]
        per_i, el = w >> 14, w & 0x3FFF
        goals.append(dict(gsp=per_i, rem=P - el))
    goals.sort(key=lambda x: (x['gsp'], -x['rem']))
    # Scoring team: exact per period, from the score change at each period boundary (quota per team).
    # Shot link: the nearest earlier shot in the same period by a team that still has a goal to assign,
    # within 120 s. The link is approximate (rebounds and scrambles); the team and state are not.
    used = set()
    quota = {k: {'home': gh, 'away': ga} for k, (gh, ga) in enumerate(pgoals)}
    for gl in goals:
        k = gl['gsp']
        q = quota.get(k, {'home': 0, 'away': 0})
        cands = []
        for si, s in enumerate(shots):
            d = s['clock'] - gl['rem']
            if si not in used and s['gsp'] == k and 0 <= d <= 120 and q.get(s['team'], 0) > 0:
                cands.append((d, si))
        if cands:
            d, si = min(cands)
            used.add(si)
            team = shots[si]['team']
            shots[si]['outcome'] = 'goal'
            gl.update(matched=True, shot=si)
        else:
            open_teams = [t for t in ('home', 'away') if q.get(t, 0) > 0]
            team = open_teams[0] if len(open_teams) == 1 else None
            gl.update(matched=False, shot=None)
        if team:
            quota[k][team] -= 1
        gl.update(team=team, state=state_at(team, k, gl['rem']) if team else None)
    mismatch = sum(1 for k in quota for t in quota[k] if quota[k][t] != 0)
    pcum = [(0, 0)] + [(q['home']['pen'], q['away']['pen']) for q in per]
    pens_by_period = [(pcum[i + 1][0] - pcum[i][0]) + (pcum[i + 1][1] - pcum[i][1]) for i in range(len(per))]

    # Recorder v4: goal lines come from the Goal routine and read the scoring team and PP flag from the game's
    # team blocks. When present they replace the inferred attribution above (record3 games keep it).
    v4 = [r for r in recs if r['type'] == 'goal']
    source = 'v4' if v4 else 'v3-inferred'
    pp_ok = None
    if v4:
        for s in shots:
            if s.get('outcome') == 'goal':
                s['outcome'] = None
        goals = []
        spurious = sum(1 for r in v4 if r['team'] not in ('home', 'away'))   # Goal entered, score did not change
        for r in v4:
            team = r['team'] if r['team'] in ('home', 'away') else None
            if team is None:
                continue
            st = None
            if team == 'home':
                st = state_of(r['hAp'], r['aAp'])
            elif team == 'away':
                st = state_of(r['aAp'], r['hAp'])
            goals.append(dict(gsp=r['gsp'], rem=r['clock'], team=team, state=st, pp=r['pp'], x=r['x'], y=r['y'],
                              matched=False, shot=None))
        goals.sort(key=lambda x: (x['gsp'], -x['rem']))
        used = set()
        for gl in goals:
            if gl['team'] is None:
                continue
            cands = [(s['clock'] - gl['rem'], si) for si, s in enumerate(shots)
                     if si not in used and s['gsp'] == gl['gsp'] and s['team'] == gl['team']
                     and 0 <= s['clock'] - gl['rem'] <= 120]
            if cands:
                d, si = min(cands)
                used.add(si)
                shots[si]['outcome'] = 'goal'
                gl.update(matched=True, shot=si)
        mismatch = 0
        for k, (gh, ga) in enumerate(pgoals):
            mh = sum(1 for x in goals if x['gsp'] == k and x['team'] == 'home')
            ma = sum(1 for x in goals if x['gsp'] == k and x['team'] == 'away')
            if (mh, ma) != (gh, ga):
                mismatch += 1
        pp_ok = (sum(x['pp'] for x in goals if x['team'] == 'home') == fin['home']['ppGoals'] and
                 sum(x['pp'] for x in goals if x['team'] == 'away') == fin['away']['ppGoals'])
    # save outcomes and rebound outcomes for shots not goals
    for si, s in enumerate(shots):
        if s.get('outcome') == 'goal':
            continue
        opp = 'B' if s['grp'] == 'A' else 'A'
        saved = any(t['grp'] == opp and s['frame'] - 30 <= t['frame'] <= s['frame'] + SAVE_WINDOW for t in touches)
        s['outcome'] = 'saved' if saved else 'other'
        s['rebound'] = ''
        if saved:
            s['rebound'] = rebound_outcome(s, shots, glues, stops, polls, grp_of, team_of)

    # exposure: game-clock seconds per team state, regulation vs OT
    expo = collections.Counter()
    # clock lists are ascending; the interval is [a.clock, b.clock] (b is the earlier moment), state from b
    for gsp, lst in cl_by_gsp.items():
        for a, b in zip(lst, lst[1:]):
            dt = b['clock'] - a['clock']
            if 0 <= dt <= 2:
                ptype = 'REG' if gsp < 3 else 'OT'
                expo[(ptype, 'home', state_of(b['hmAp'], b['awAp']))] += dt
                expo[(ptype, 'away', state_of(b['awAp'], b['hmAp']))] += dt

    # possession segments
    poss_segs = []
    for a, b in zip(polls, polls[1:]):
        if a['gsp'] != b['gsp'] or b['frame'] <= a['frame']:
            continue
        ptype = 'REG' if a['gsp'] < 3 else 'OT'
        if a['to'] < 0:
            owner, st = 'loose', None
        else:
            owner = team_of(grp_of(a['to']))
            st = state_at(owner, a['gsp'], a['clock'])
        poss_segs.append(dict(ptype=ptype, owner=owner, state=st, secs=(b['frame'] - a['frame']) / FPS,
                              x=a['x'], y=a['y']))

    stop_counts = collections.Counter()
    for s in stops:
        stop_counts[('REG' if s['gsp'] < 3 else 'OT', s['code'])] += 1

    return dict(id=g['id'], cfg=g['cfg'], P=P, seed=start.get('seed'), state=os.path.basename(start.get('state', '') or ''),
                gsp_periods=len(per), ot=len(per) > 3,
                goals=goals, shots=shots, touches=touches, expo=expo, poss=poss_segs, stops=stop_counts,
                final=fin, pgoals=pgoals, pens_by_period=pens_by_period, mismatch=mismatch,
                source=source, pp_ok=pp_ok, spurious=spurious if v4 else 0,
                frames=fin['frames'], opts=opts,
                team_of=team_of)


def rebound_outcome(s, shots, glues, stops, polls, grp_of, team_of):
    """First event within the rebound window after a save: whistle, goalie hold, shot, control or nothing."""
    end = s['frame'] + REBOUND_WINDOW
    events = []
    for st in stops:
        if s['frame'] < st['frame'] <= end:
            events.append((st['frame'], 'whistle'))
    for gl in glues:
        if s['frame'] < gl['frame'] <= end:
            events.append((gl['frame'], 'goalie hold' if gl['by'] in (5, 11) else 'skater control'))
    for t in shots:
        if s['frame'] < t['frame'] <= end and t is not s:
            events.append((t['frame'], 'shot by attacking team' if t['grp'] == s['grp'] else 'shot by defence'))
    for p in polls:
        if s['frame'] < p['frame'] <= end:
            if p['to'] < 0:
                events.append((p['frame'], 'loose'))
            else:
                events.append((p['frame'], 'control: attacking' if grp_of(p['to']) == s['grp'] else 'control: defence'))
    if not events:
        return 'nothing within 3 s'
    return min(events)[1]


def run(games):
    # decide which object group is home from final shot counts
    corr = 0
    for g in games:
        fin = g['fin']
        nA = sum(1 for r in g['recs'] if r.get('ev') == 'shot' and r['by'] < 6)
        nB = sum(1 for r in g['recs'] if r.get('ev') == 'shot' and r['by'] >= 6)
        corr += (nA - nB) * (fin['home']['shots'] - fin['away']['shots'])
    A_is_home = corr >= 0
    res = [derive(g, A_is_home) for g in games]
    return res, A_is_home, corr


def write_csv(path, rows, fields):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
        w.writeheader()
        for r in rows:
            w.writerow(r)


def heat(points, path, title, xr=(-130, 130), yr=(-290, 290), cell=10):
    from PIL import Image, ImageDraw
    W = int((xr[1] - xr[0]) / cell)
    H = int((yr[1] - yr[0]) / cell)
    grid = [[0] * W for _ in range(H)]
    for x, y in points:
        i = int((x - xr[0]) / cell)
        j = int((y - yr[0]) / cell)
        if 0 <= i < W and 0 <= j < H:
            grid[j][i] += 1
    mx = max(max(r) for r in grid) or 1
    scale = 4
    img = Image.new('RGB', (W * scale, H * scale + 24), 'white')
    d = ImageDraw.Draw(img)
    for j in range(H):
        for i in range(W):
            v = grid[H - 1 - j][i] / mx
            c = (255, int(255 * (1 - v)), int(255 * (1 - v)))
            d.rectangle([i * scale, j * scale, (i + 1) * scale - 1, (j + 1) * scale - 1], fill=c)
    d.text((4, H * scale + 6), title, fill='black')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pattern')
    ap.add_argument('outdir')
    ap.add_argument('--report', default=None, help='where to write the markdown report (also kept in outdir)')
    args = ap.parse_args()
    games = load_games(args.pattern)
    res, A_is_home, corr = run(games)
    out = args.outdir
    os.makedirs(out, exist_ok=True)

    # ---------- CSVs ----------
    game_rows, shot_rows, goal_rows, expo_rows, poss_rows, stop_rows = [], [], [], [], [], []
    for r in res:
        fin = r['final']
        goals_h = sum(1 for x in r['goals'] if x['team'] == 'home' and x['matched'])
        goals_a = sum(1 for x in r['goals'] if x['team'] == 'away' and x['matched'])
        game_rows.append(dict(id=r['id'], cfg=r['cfg'], period_sec=r['P'], seed=r['seed'], start_state=r['state'],
                              periods=r['gsp_periods'], ot=int(r['ot']), frames=r['frames'],
                              real_min=round(r['frames'] / FPS / 60, 2),
                              home_score=fin['home']['score'], away_score=fin['away']['score'],
                              home_shots_final=fin['home']['shots'], away_shots_final=fin['away']['shots'],
                              shot_events=len(r['shots']), goals_matched=goals_h + goals_a,
                              goals_total=len(r['goals']), period_mismatch=r['mismatch'],
                              penalties_home=fin['home']['pen'], penalties_away=fin['away']['pen'],
                              pp_home=fin['home']['pp'], pp_away=fin['away']['pp'],
                              ppg_home=fin['home']['ppGoals'], ppg_away=fin['away']['ppGoals']))
        for s in r['shots']:
            shot_rows.append(dict(game=r['id'], cfg=r['cfg'], period_type='REG' if s['gsp'] < 3 else 'OT',
                                  gsp=s['gsp'], clock=s['clock'], team=s['team'], x=s['x'], y=s['y'],
                                  dist_ft=round(s['dist'], 1), angle_deg=round(s['ang'], 1), state=s['state'],
                                  outcome=s['outcome'], rebound=s.get('rebound', '')))
        for gl in r['goals']:
            goal_rows.append(dict(game=r['id'], cfg=r['cfg'], period_type='REG' if gl['gsp'] < 3 else 'OT',
                                  gsp=gl['gsp'], remaining=gl['rem'], matched=int(gl['matched']),
                                  team=gl['team'] or '', state=gl['state'] or ''))
        for (pt, team, st), secs in sorted(r['expo'].items()):
            expo_rows.append(dict(game=r['id'], cfg=r['cfg'], period_type=pt, team=team, state=st, game_secs=secs))
        for p in r['poss']:
            poss_rows.append(dict(game=r['id'], cfg=r['cfg'], period_type=p['ptype'], owner=p['owner'],
                                  state=p['state'] or '', secs=round(p['secs'], 3), x=p['x'], y=p['y']))
        for (pt, code), n in sorted(r['stops'].items()):
            stop_rows.append(dict(game=r['id'], cfg=r['cfg'], period_type=pt, code=code, count=n))
    write_csv(os.path.join(out, 'games.csv'), game_rows, list(game_rows[0].keys()))
    write_csv(os.path.join(out, 'shots.csv'), shot_rows, list(shot_rows[0].keys()) if shot_rows else ['game'])
    write_csv(os.path.join(out, 'goals.csv'), goal_rows, list(goal_rows[0].keys()) if goal_rows else ['game'])
    write_csv(os.path.join(out, 'exposure.csv'), expo_rows, list(expo_rows[0].keys()))
    write_csv(os.path.join(out, 'possession.csv'), poss_rows, list(poss_rows[0].keys()) if poss_rows else ['game'])
    write_csv(os.path.join(out, 'stops.csv'), stop_rows, list(stop_rows[0].keys()) if stop_rows else ['game'])

    # ---------- figures ----------
    figdir = os.path.join(out, 'figures')
    for cfg in sorted({r['cfg'] for r in res}):
        pts = [(s['x'], s['y']) for r in res if r['cfg'] == cfg for s in r['shots']]
        heat(pts, os.path.join(figdir, f'heat_shots_{cfg}.png'), f'shot locations {cfg} (n={len(pts)}, prelim)')
        for st in ('PP', 'EV', 'SH'):
            pp = [(p['x'], p['y']) for r in res if r['cfg'] == cfg for p in r['poss'] if p['state'] == st]
            heat(pp, os.path.join(figdir, f'heat_possession_{cfg}_{st}.png'),
                 f'owner in {st}: {cfg} (n={len(pp)}, prelim)')

    # ---------- report ----------
    L = []
    L.append('# NHL 95 Genesis recorder study — PRELIMINARY analysis\n')
    L.append(f"**Status: preliminary.** Built from {len(res)} finished games in {len(set(r['cfg'] for r in res))} "
             f"period-length groups. Batch still running; no parameters are fitted from these results. "
             f"Re-run `analyze_runs.py` on the full set to regenerate.\n")
    L.append('## Dataset\n')
    L.append('| config | games | seeds unique | start states | regulation shots (doshot) | mean real min/game |')
    L.append('|---|---|---|---|---|---|')
    for cfg in sorted({r['cfg'] for r in res}):
        G = [r for r in res if r['cfg'] == cfg]
        states = sorted({os.path.basename(r['state']) for r in G})
        real = [r['frames'] / FPS / 60 for r in G]
        L.append(f"| {cfg} | {len(G)} | {len({r['seed'] for r in G})} | {', '.join(states)} | "
                 f"{sum(len(r['shots']) for r in G)} | {sum(real) / len(real):.1f} |")
    L.append('')
    L.append('## Validation checks\n')
    tot_goals = sum(len(r['goals']) for r in res)
    tot_matched = sum(1 for r in res for x in r['goals'] if x['matched'])
    tot_mis = sum(r['mismatch'] for r in res)
    ss_ok = sum(1 for r in res if len(r['goals']) == r['final']['home']['score'] + r['final']['away']['score'])
    L.append(f"- ScoreSum goal count equals final score: {ss_ok}/{len(res)} games.")
    L.append(f"- Goals linked to a shot event (approximate, 120 s window): {tot_matched}/{tot_goals} "
             f"({tot_matched / max(1, tot_goals):.0%}). Scoring team and manpower state at the goal do not depend on the link.")
    L.append(f"- Period-quota leftovers (goals the period score says a team scored that could not be assigned): {tot_mis}.")
    L.append(f"- Object-group mapping: group A (indices 0-5) = {'home' if A_is_home else 'away'} "
             f"(agreement score {corr}; {'consistent' if corr > 0 else 'weak'} with final shots).")
    doshot = sum(len(r['shots']) for r in res)
    final_sh = sum(r['final']['home']['shots'] + r['final']['away']['shots'] for r in res)
    L.append(f"- Shot events (doshot hook) vs final shot counters: {doshot} vs {final_sh} "
             f"(ratio {doshot / max(1, final_sh):.2f}). Shot-event totals are NOT the game's shot counter; "
             f"the distance tables below use shot events.")
    n60 = sum(1 for r in res for s in r['shots'] if s['dist'] >= 60)
    L.append(f"- Shots more than 60 ft from the attacked net: {n60}/{doshot} (distance tables stop at 60 ft; a large share here would mean the attacking direction is wrong).")
    code14 = sum(v for r in res for (pt, c), v in r['stops'].items() if c == 14)
    pp_attrib = sum(1 for r in res for g in r['goals'] if g['team'] and g['state'] == 'PP')
    pp_counter = sum(r['final']['home']['ppGoals'] + r['final']['away']['ppGoals'] for r in res)
    L.append(f"- Stoppage code 14 (AddPenalty2 call) occurs {code14} times for {tot_goals} goals: it is the goal stoppage. "
             f"Its puck position is where the goal went in.")
    v4_res = [r for r in res if r['source'] == 'v4']
    if v4_res and len(v4_res) == len(res):
        ok = sum(1 for r in res if r['pp_ok'])
        spur = sum(r['spurious'] for r in res)
        L.append(f"- Scoring team and power-play flag come from the recorder v4 goal lines. Power-play goals per team match "
                 f"the game's own counter in {ok}/{len(res)} games. Goal calls with no score change (ignored): {spur}.")
    else:
        L.append('- **Scoring team and manpower state at a goal: UNVERIFIED.** Goals attributed to power-play state total '
                 f"{pp_attrib} against the game's own power-play goal counter total of {pp_counter}. "
                 'Neither index-to-team mapping reproduces the counter. The manpower-specific scoring table below is '
                 'therefore not a finding yet.')
    L.append('- Rink zone boundary (blue line at 225 units) and attacking direction are assumptions, not yet verified in the render.')
    L.append('- Goalie object indices assumed to be 5 and 11 (observed as the save/contact targets).')
    L.append('')
    L.append('## Goals per game, shots, and percentiles (per game, both teams)\n')
    L.append('| config | period type | goals mean [p10, p50, p90] | shot events mean [p10, p50, p90] |')
    L.append('|---|---|---|---|')
    for cfg in sorted({r['cfg'] for r in res}):
        G = [r for r in res if r['cfg'] == cfg]
        g = [r['final']['home']['score'] + r['final']['away']['score'] for r in G]
        s = [len(r['shots']) for r in G]
        L.append(f"| {cfg} | all | {sum(g) / len(g):.2f} [{pct(g, .1):.0f}, {pct(g, .5):.0f}, {pct(g, .9):.0f}] | "
                 f"{sum(s) / len(s):.1f} [{pct(s, .1):.0f}, {pct(s, .5):.0f}, {pct(s, .9):.0f}] |")
    L.append('')
    L.append('## Rates per 60 game-minutes with 95% CI (games resampled)\n')
    L.append('| config | period | goals | shot events | penalties (both teams) |')
    L.append('|---|---|---|---|---|')
    for cfg in sorted({r['cfg'] for r in res}):
        for ptype in ('REG', 'OT'):
            G = [r for r in res if r['cfg'] == cfg and (ptype == 'REG' or r['ot'])]
            if not G:
                continue
            mins = [sum(v for (pt, _, _), v in r['expo'].items() if pt == ptype) / 60 for r in G]
            if ptype == 'REG':
                mins = [3 * r['P'] / 60 for r in G]
            ng = [sum(1 for x in r['goals'] if x['gsp'] < 3 and ptype == 'REG' or x['gsp'] >= 3 and ptype == 'OT') for r in G]
            ns = [sum(1 for x in r['shots'] if (x['gsp'] < 3) == (ptype == 'REG')) for r in G]
            npn = [sum(p for k, p in enumerate(r['pens_by_period']) if (k < 3) == (ptype == 'REG')) for r in G]
            L.append(f"| {cfg} | {ptype} (n={len(G)}) | {fmt_rate(boot_rate(ng, mins))} | "
                     f"{fmt_rate(boot_rate(ns, mins))} | {fmt_rate(boot_rate(npn, mins))} |")
    L.append('')
    L.append('## Shooting by distance and angle (shot events; goal = matched to a goal, saved = goalie touch in 3 s)\n')
    L.append('| config | distance (ft) | shots | goals | sh% [95% Wilson] | goalie touch (3 s) | other |')
    L.append('|---|---|---|---|---|---|---|')
    for cfg in sorted({r['cfg'] for r in res}):
        S = [s for s in shot_rows if s['cfg'] == cfg]
        for lo, hi in DISTANCE_BINS:
            B = [s for s in S if lo <= s['dist_ft'] < hi]
            n = len(B); gl = sum(1 for s in B if s['outcome'] == 'goal')
            sv = sum(1 for s in B if s['outcome'] == 'saved'); ot = n - gl - sv
            w = wilson(gl, n)
            L.append(f"| {cfg} | {lo}–{hi} | {n} | {gl} | {gl / n:.1%} [{w[0]:.1%}, {w[1]:.1%}] | {sv} | {ot} |"
                     if n else f"| {cfg} | {lo}–{hi} | 0 | 0 | — | 0 | 0 |")
    L.append('')
    L.append('| config | angle (deg from net-perpendicular) | shots | goals | sh% |')
    L.append('|---|---|---|---|---|')
    for cfg in sorted({r['cfg'] for r in res}):
        S = [s for s in shot_rows if s['cfg'] == cfg]
        for lo, hi in ANGLE_BINS:
            B = [s for s in S if lo <= s['angle_deg'] < hi]
            n = len(B); gl = sum(1 for s in B if s['outcome'] == 'goal')
            L.append(f"| {cfg} | {lo}–{hi} | {n} | {gl} | {(gl / n if n else float('nan')):.1%} |")
    L.append('')
    L.append('## Rebound outcomes after saved shots\n')
    L.append('| config | outcome | count | share |')
    L.append('|---|---|---|---|')
    for cfg in sorted({r['cfg'] for r in res}):
        R = [s['rebound'] for s in shot_rows if s['cfg'] == cfg and s['outcome'] == 'saved']
        for k in sorted(set(R), key=lambda k: -R.count(k)):
            L.append(f"| {cfg} | {k} | {R.count(k)} | {R.count(k) / len(R):.1%} |")
    L.append('')
    L.append('## Possession duration (real seconds per segment, distribution)\n')
    L.append('| config | owner | segments | median | p10 | p90 | mean |')
    L.append('|---|---|---|---|---|---|---|')
    for cfg in sorted({r['cfg'] for r in res}):
        for owner in ('home', 'away', 'loose'):
            d = [p['secs'] for r in res if r['cfg'] == cfg for p in r['poss'] if p['owner'] == owner]
            if d:
                L.append(f"| {cfg} | {owner} | {len(d)} | {pct(d, .5):.2f} | {pct(d, .1):.2f} | {pct(d, .9):.2f} | "
                         f"{sum(d) / len(d):.2f} |")
    L.append('')
    if v4_res and len(v4_res) == len(res):
        L.append("## Manpower: goals and shots per 60 manpower minutes (scoring team's own state)\n")
    else:
        L.append("## Manpower: goals and shots per 60 manpower minutes (scoring team's own state) — UNVERIFIED goal attribution\n")
        L.append("Shot rates are usable with the caveats above. Goal rates by state are NOT, until the goal-to-team attribution matches the game's power-play counter.\n")
    L.append('| config | state | game-minutes exposed (sum) | goals / 60 min [95% CI] | shots / 60 min [95% CI] |')
    L.append('|---|---|---|---|---|')
    for cfg in sorted({r['cfg'] for r in res}):
        G = [r for r in res if r['cfg'] == cfg]
        for st in ('EV', 'PP', 'SH'):
            mins, gg, ss = [], [], []
            for r in G:
                m = sum(v for (pt, team, s_), v in r['expo'].items() if s_ == st and team == 'home') / 60 \
                    + sum(v for (pt, team, s_), v in r['expo'].items() if s_ == st and team == 'away') / 60
                mins.append(m)
                gg.append(sum(1 for x in r['goals'] if x['team'] is not None and x['state'] == st))
                ss.append(sum(1 for x in r['shots'] if x['state'] == st))
            L.append(f"| {cfg} | {st} | {sum(mins):.1f} | {fmt_rate(boot_rate(gg, mins))} | {fmt_rate(boot_rate(ss, mins))} |")
    L.append('')
    L.append('State rates use the scoring/shooting team\'s own manpower state, and pool both teams\' exposure. '
             'Goal attribution depends on the shot match (see validation).\n')
    L.append('## Stoppage codes (labels not yet decoded)\n')
    L.append('Codes are the last whistle code from the penalty routine; stop-cause labels are still unverified '
             '(the stop read is unreliable per STUDY.md). Counts per 60 game-minutes:\n')
    L.append('| config | period | code | per 60 min [95% CI] |')
    L.append('|---|---|---|---|')
    for cfg in sorted({r['cfg'] for r in res}):
        G = [r for r in res if r['cfg'] == cfg]
        mins = [3 * r['P'] / 60 for r in G]
        codes = collections.Counter()
        for r in G:
            for (pt, code), n in r['stops'].items():
                codes[(pt, code)] += 1
        for (pt, code), _ in codes.most_common(8):
            n_per = [sum(v for (p2, c2), v in r['stops'].items() if p2 == pt and c2 == code) for r in G]
            L.append(f"| {cfg} | {pt} | {code} | {fmt_rate(boot_rate(n_per, mins))} |")
    L.append('')
    L.append('## Figures (in ' + os.path.join(out, 'figures') + ')\n')
    L.append('- `heat_shots_<cfg>.png`: shot-event locations, all teams, attacking-direction unfolded only as recorded.')
    L.append('- `heat_possession_<cfg>_<state>.png`: possession-segment locations by the owner\'s manpower state.')
    L.append('- Player-position heatmaps by role are NOT produced: the recorder logs no per-player positions by role yet '
             '(the traj line is not decoded). See the record-4 notes.\n')
    text = '\n'.join(L)
    open(os.path.join(out, 'report.md'), 'w', encoding='utf-8').write(text)
    if args.report:
        os.makedirs(os.path.dirname(args.report), exist_ok=True)
        open(args.report, 'w', encoding='utf-8').write(text)
    print(f"wrote {len(res)} games to {out}")


if __name__ == '__main__':
    main()
