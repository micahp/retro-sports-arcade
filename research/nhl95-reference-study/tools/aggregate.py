"""Aggregate NHL 95 recorder runs by period length: raw game totals and per-60-game-minute rates."""
import json, glob, os, sys, statistics as st
sys.path.insert(0, os.path.dirname(__file__))
from summarize import games, pp_spans

runs = sys.argv[1] if len(sys.argv) > 1 else 'E:/emu/work/runs/C3/*.jsonl'
by = {}
for path in sorted(glob.glob(runs)):
    for g in games(path):
        start = g[0]; fin = g[-1]
        cfg = os.path.basename(path).split('-s')[0]
        per = [r for r in g if r['type'] == 'gsp']
        clocks = [r for r in g if r['type'] == 'clock']
        ot = len(per) > 3
        oc = [c['clock'] for c in clocks if c['gsp'] == 3]          # OT counts down from 600
        ot_sec = (max(oc) - min(oc[1:] or oc)) if ot and oc else 0
        plen = start['perTimeTotal']
        by.setdefault(cfg, []).append(dict(seed=start.get('seed'), h=fin['home'], a=fin['away'], ot=ot, ot_sec=ot_sec,
                                          plen=plen, gmin=(3 * plen + ot_sec) / 60, frames=fin['frames'], spans=pp_spans(g)))

print('| | 5-min periods | 10-min periods | 20-min periods |')
print('|---|---|---|---|')
order = [c for c in ('5-pen', '10-pen', '20-pen') if c in by]
def row(label, f):
    print(f'| {label} | ' + ' | '.join(f(by[c]) for c in order) + ' |')
m = lambda xs: st.mean(xs)
row('games', lambda G: str(len(G)))
row('goals per game (both teams), mean · range', lambda G: f"{m([x['h']['score'] + x['a']['score'] for x in G]):.1f} · {min(x['h']['score'] + x['a']['score'] for x in G)}–{max(x['h']['score'] + x['a']['score'] for x in G)}")
row('shots per game (both teams)', lambda G: f"{m([x['h']['shots'] + x['a']['shots'] for x in G]):.1f}")
def sv(G):
    s = sum(x['h']['shots'] + x['a']['shots'] for x in G); g = sum(x['h']['score'] + x['a']['score'] for x in G)
    return f"{1 - g / s:.3f} (sh% {g / s:.1%})"
row('save % (all goals / all shots)', sv)
row('tied after regulation', lambda G: f"{sum(x['ot'] for x in G)}/{len(G)}")
row('still tied after OT (a tie)', lambda G: f"{sum(1 for x in G if x['ot'] and x['h']['score'] == x['a']['score'])}/{len(G)}")
row('penalties per team per game', lambda G: f"{m([(x['h']['pen'] + x['a']['pen']) / 2 for x in G]):.1f}")
row('PP opportunities per team per game', lambda G: f"{m([(x['h']['pp'] + x['a']['pp']) / 2 for x in G]):.1f}")
def ppp(G):
    o = sum(x['h']['pp'] + x['a']['pp'] for x in G); g = sum(x['h']['ppGoals'] + x['a']['ppGoals'] for x in G)
    return f"{g}/{o} = {g / o:.1%}" if o else '—'
row('PP conversion', ppp)
def spans(G):
    S = [s for x in G for s in x['spans']]
    near = sum(1 for s in S if 115 <= s <= 125)
    return f"{near}/{len(S)} spans at 115–125 s; median {st.median(S):.0f} s" if S else '—'
row('short-handed spans (game-clock s)', spans)
row('real minutes per game (emulator frames / 59.92)', lambda G: f"{m([x['frames'] / 59.92 / 60 for x in G]):.1f}")
print()
print('Per 60 game-minutes (regulation + OT clock):')
print()
print('| | ' + ' | '.join(order) + ' |'); print('|---|' + '---|' * len(order))
def per60(key):
    return lambda G: f"{sum(key(x) for x in G) / sum(x['gmin'] for x in G) * 60:.1f}"
row('goals', per60(lambda x: x['h']['score'] + x['a']['score']))
row('shots', per60(lambda x: x['h']['shots'] + x['a']['shots']))
row('penalties (both teams)', per60(lambda x: x['h']['pen'] + x['a']['pen']))
row('PP opportunities (both teams)', per60(lambda x: x['h']['pp'] + x['a']['pp']))
print()
print('Per real minute of play (emulator time):')
print()
print('| | ' + ' | '.join(order) + ' |'); print('|---|' + '---|' * len(order))
def perreal(key):
    return lambda G: f"{sum(key(x) for x in G) / sum(x['frames'] / 59.92 / 60 for x in G):.3f}"
row('goals per real minute', perreal(lambda x: x['h']['score'] + x['a']['score']))
row('shots per real minute', perreal(lambda x: x['h']['shots'] + x['a']['shots']))
