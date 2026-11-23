// Builds the calibration report from evaluator output.
//   node calibration/report.mjs --data <dir with *.jsonl.gz> [--tag baseline] [--out calibration]
// Writes REPORT.md, charts/*.svg, summary.json and appends history.jsonl.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const DATA = args.data, TAG = args.tag || 'baseline', OUT = args.out || HERE;
const REF = JSON.parse(readFileSync(path.join(HERE, 'references.json'), 'utf8'));
const N24 = REF.nhl['2024-25'], N25 = REF.nhl['2025-26'];

// ---------------------------------------------------------------- load
const sets = {}, metas = [];
for (const f of readdirSync(DATA).filter((f) => f.startsWith(TAG + '-') && f.endsWith('.jsonl.gz'))) {
  for (const line of gunzipSync(readFileSync(path.join(DATA, f))).toString().trim().split('\n')) {
    const r = JSON.parse(line);
    if (r.kind === 'meta') metas.push({ ...r, file: f }); else (sets[r.set] = sets[r.set] || []).push(r);
  }
}

// ---------------------------------------------------------------- stats helpers
const sum = (a) => a.reduce((s, x) => s + x, 0), mean = (a) => (a.length ? sum(a) / a.length : NaN);
const sd = (a) => { const m = mean(a); return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / Math.max(1, a.length - 1)); };
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); if (!s.length) return NaN; const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const describe = (a) => ({ n: a.length, mean: mean(a), sd: sd(a), median: q(a, 0.5), p5: q(a, 0.05), p25: q(a, 0.25), p75: q(a, 0.75), p95: q(a, 0.95), ci: [mean(a) - 1.96 * sd(a) / Math.sqrt(a.length), mean(a) + 1.96 * sd(a) / Math.sqrt(a.length)] });
// ratio of sums with a by-game bootstrap CI
function ratio(games, num, den, B = 1000) {
  const ns = games.map(num), ds = games.map(den), r = sum(ns) / sum(ds), R = rng(12345), out = [];
  for (let b = 0; b < B; b++) { let a = 0, c = 0; for (let i = 0; i < games.length; i++) { const k = Math.floor(R() * games.length); a += ns[k]; c += ds[k]; } out.push(a / c); }
  return { value: r, ci: [q(out, 0.025), q(out, 0.975)], num: sum(ns), den: sum(ds) };
}
const f = (x, d = 2) => (x == null || Number.isNaN(x) ? 'n/a' : Number(x).toFixed(d));
const pct = (x, d = 1) => (x == null || Number.isNaN(x) ? 'n/a' : (100 * x).toFixed(d) + '%');

// Result from the record itself: shootout if there were attempts, overtime if any goal came after period 3
// or more than three periods ended. (evaluate.mjs at b4769f9 inferred OT only from period ends, which
// misses every sudden-death winner; this re-derives it from the stored goals.)
const resultOf = (g) => (g.logCounts && g.logCounts.attempt ? 'SO' : Object.keys(g.periodGoals || {}).some((p) => +p > 3) || (g.logCounts && g.logCounts.periodEnd > 3) ? 'OT' : 'REG');
for (const games of Object.values(sets)) for (const g of games) { g.resultLogged = g.result; g.result = resultOf(g); }
// ---------------------------------------------------------------- per-game derived measures
const MISS = ['miss-wide', 'miss-high', 'miss-boards', 'miss-net-outside', 'crossed-mouth-no-goal'];
const OTHER = ['dead', 'unresolved', 'end', 'superseded', 'deflected-own-net'];
function derive(g) {
  const s = g.shots, by = (o) => s.filter((x) => x.outcome === o).length, byIn = (list) => s.filter((x) => list.includes(x.outcome)).length;
  const goalsFromShots = by('goal'), saves = by('save'), savesOn = s.filter((x) => x.outcome === 'save' && x.onTarget).length;
  const per60 = 3600 / g.inPlay;
  const passes = g.passes, comp = passes.filter((p) => p.outcome === 'complete' || p.outcome === 'complete-after-contact').length;
  return {
    goals: g.score[0] + g.score[1], goalsAll: g.goals.length, goalsFromShots, goalsNonShot: g.goals.filter((x) => x.src === 'non-shot').length, ownGoals: g.goals.filter((x) => x.own).length,
    attempts: s.length, saves, savesOn, savesOff: saves - savesOn, sogCredited: goalsFromShots + saves, sogTrue: goalsFromShots + savesOn,
    blocked: by('blocked'), blockedTeammate: by('blocked-by-teammate'), missed: byIn(MISS), short: by('controlled-short'), other: byIn(OTHER),
    posts: s.filter((x) => x.post).length, rebounds: s.filter((x) => x.rebound).length,
    onTargetPred: s.filter((x) => x.onTarget).length,
    passes: passes.length, completions: comp, intercepted: passes.filter((p) => p.outcome === 'intercepted').length, passOther: passes.length - comp - passes.filter((p) => p.outcome === 'intercepted').length,
    checkAttempts: g.checks.attempts, checkContacts: g.checks.contacts, hits: g.checks.hits, pokes: g.checks.pokes, pokesWon: g.checks.pokesWon,
    faceoffs: g.faceoffs.length, freezes: g.stoppages.filter((x) => x.reason === 'freeze').length, stoppages: g.stoppages.length,
    poss: g.poss.length, possMeanDur: mean(g.poss.map((p) => p.dur)),
    inPlay: g.inPlay, per60, simT: g.simT, wallMs: g.wallMs,
    margin: Math.abs(g.score[0] - g.score[1]), t0Goals: g.score[0], t1Goals: g.score[1],
    statsShots: g.stats[0].shots + g.stats[1].shots, statsSaves: g.stats[0].saves + g.stats[1].saves, statsGoals: g.stats[0].goals + g.stats[1].goals,
    logGoals: g.logCounts.goal || 0, logShots: g.logCounts.shot || 0,
  };
}

// ---------------------------------------------------------------- charts (plain SVG, white card so it reads in any theme)
mkdirSync(path.join(OUT, 'charts'), { recursive: true });
function bars(file, title, labels, series, { yfmt = (v) => f(v, 0), w = 640, h = 300, note = '' } = {}) {
  const pad = { l: 56, r: 16, t: 40, b: 58 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(...series.flatMap((s) => s.values.filter((v) => v != null && !Number.isNaN(v))), 1e-9) * 1.1;
  const gw = iw / labels.length, bw = (gw * 0.8) / series.length;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="Helvetica,Arial,sans-serif"><rect width="${w}" height="${h}" fill="#ffffff"/><text x="${pad.l}" y="22" font-size="14" font-weight="bold" fill="#1d2530">${title}</text>`;
  for (let k = 0; k <= 4; k++) { const y = pad.t + ih - (ih * k) / 4; svg += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y}" y2="${y}" stroke="#e3e8ee"/><text x="${pad.l - 6}" y="${y + 4}" font-size="10" text-anchor="end" fill="#5a6675">${yfmt((max * k) / 4)}</text>`; }
  labels.forEach((lab, i) => {
    series.forEach((s, j) => { const v = s.values[i]; if (v == null || Number.isNaN(v)) return; const bh = (ih * v) / max; svg += `<rect x="${pad.l + i * gw + gw * 0.1 + j * bw}" y="${pad.t + ih - bh}" width="${bw - 1}" height="${bh}" fill="${s.color}"/>`; });
    svg += `<text x="${pad.l + i * gw + gw / 2}" y="${pad.t + ih + 14}" font-size="10" text-anchor="middle" fill="#3a4554">${lab}</text>`;
  });
  series.forEach((s, j) => { svg += `<rect x="${pad.l + j * 150}" y="${h - 24}" width="10" height="10" fill="${s.color}"/><text x="${pad.l + j * 150 + 14}" y="${h - 15}" font-size="11" fill="#3a4554">${s.name}</text>`; });
  if (note) svg += `<text x="${w - pad.r}" y="${h - 15}" font-size="10" text-anchor="end" fill="#7a8696">${note}</text>`;
  writeFileSync(path.join(OUT, 'charts', file), svg + '</svg>');
  return `charts/${file}`;
}
const hist = (vals, edges) => edges.slice(0, -1).map((e, i) => vals.filter((v) => v >= e && (i === edges.length - 2 ? v <= edges[i + 1] : v < edges[i + 1])).length / vals.length);

// ---------------------------------------------------------------- build
const md = [];
const out = { tag: TAG, sets: {} };
md.push(`# Rink '95 calibration report: ${TAG}`, '');
md.push(`Generated by \`calibration/report.mjs\` from evaluator output. **This is a baseline measurement, not a validation.** Nothing in it shows the game resembles real hockey; it shows where it does and does not.`, '');
md.push('| Run | Set | Seeds | Commit | Sim changed since commit | Games |', '|---|---|---|---|---|---|');
for (const m of metas) md.push(`| ${m.file} | ${m.set} | ${m.set}-${m.start}…${m.set}-${m.start + m.n - 1} | ${m.commit} | ${m.dirtySim ? 'yes' : 'no'} | ${m.n} |`);
md.push('');

for (const [set, games] of Object.entries(sets).sort()) {
  const ok = games.filter((g) => g.completed && !g.error), D = ok.map(derive);
  const col = (k) => D.map((d) => d[k]);
  const per60 = (k) => D.map((d) => d[k] * d.per60);
  const R = {};
  R.n = games.length; R.completed = ok.length; R.errors = games.filter((g) => g.error).length;
  R.results = games.reduce((c, g) => ((c[g.result] = (c[g.result] || 0) + 1), c), {});
  R.inPlay = describe(col('inPlay')); R.simT = describe(col('simT')); R.wallMs = describe(col('wallMs'));
  for (const k of ['goals', 'attempts', 'sogCredited', 'sogTrue', 'missed', 'blocked', 'blockedTeammate', 'saves', 'savesOff', 'passes', 'completions', 'intercepted', 'checkAttempts', 'checkContacts', 'hits', 'faceoffs', 'freezes', 'posts', 'rebounds', 'poss', 'margin']) R[k] = describe(col(k));
  for (const k of ['goals', 'attempts', 'sogTrue', 'missed', 'blocked', 'hits', 'faceoffs']) R[k + '_per60'] = describe(per60(k));
  const G = ok.map((g, i) => ({ g, d: D[i] }));
  R.svCredited = ratio(G, (x) => x.d.saves, (x) => x.d.saves + x.d.goalsFromShots);
  R.svTrue = ratio(G, (x) => x.d.savesOn, (x) => x.d.savesOn + x.d.goalsFromShots);
  R.shTrue = ratio(G, (x) => x.d.goalsFromShots, (x) => x.d.sogTrue);
  R.onGoalShare = ratio(G, (x) => x.d.sogTrue, (x) => x.d.attempts);
  R.onGoalShareCredited = ratio(G, (x) => x.d.sogCredited, (x) => x.d.attempts);
  R.missShare = ratio(G, (x) => x.d.missed, (x) => x.d.attempts);
  R.blockShare = ratio(G, (x) => x.d.blocked + x.d.blockedTeammate, (x) => x.d.attempts);
  R.otherShare = ratio(G, (x) => x.d.short + x.d.other, (x) => x.d.attempts);
  R.phantomSaveShare = ratio(G, (x) => x.d.savesOff, (x) => x.d.saves);
  R.passCompletion = ratio(G, (x) => x.d.completions, (x) => x.d.passes);
  R.passIntercept = ratio(G, (x) => x.d.intercepted, (x) => x.d.passes);
  R.checkContactRate = ratio(G, (x) => x.d.checkContacts, (x) => x.d.checkAttempts);
  R.hitPerAttempt = ratio(G, (x) => x.d.hits, (x) => x.d.checkAttempts);
  R.nonShotGoalShare = ratio(G, (x) => x.d.goalsNonShot, (x) => x.d.goalsAll);
  R.ownGoalShare = ratio(G, (x) => x.d.ownGoals, (x) => x.d.goalsAll);
  R.reboundShare = ratio(G, (x) => x.d.rebounds, (x) => x.d.attempts);
  // penalties and special teams (records from before penalties existed have none)
  const pens = ok.flatMap((g) => g.penalties || []);
  R.penaltiesOn = ok.some((g) => g.penaltiesOn);
  R.penaltiesPerTeamGame = pens.length / (2 * ok.length);
  R.penaltyKinds = pens.reduce((c, p) => ((c[p.kind] = (c[p.kind] || 0) + 1), c), {});
  R.penaltyEnds = pens.reduce((c, p) => ((c[p.end || 'open'] = (c[p.end || 'open'] || 0) + 1), c), {});
  const goalsAll = ok.flatMap((g) => g.goals);
  R.goalsByStrength = goalsAll.reduce((c, x) => ((c[x.strength || 'untagged'] = (c[x.strength || 'untagged'] || 0) + 1), c), {});
  R.ppPct = pens.length ? (R.goalsByStrength.PP || 0) / pens.length : null;    // power-play goals per penalty called (opportunity)
  const st = {}; for (const g of ok) for (const [k, v] of Object.entries(g.strengthTime || {})) st[k] = (st[k] || 0) + v;
  const stTot = Object.values(st).reduce((a, b) => a + b, 0) || 1; R.strengthShare = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, v / stTot]));
  const tied = games.filter((g) => g.result !== 'REG').length;
  R.pastRegulation = tied / games.length; R.shootout = (R.results.SO || 0) / games.length; R.otDecided = (R.results.OT || 0) / games.length;
  // tie probability expected if each team's goals were independent Poisson with the observed means
  const m0 = mean(col('t0Goals')), m1 = mean(col('t1Goals')); let pTie = 0; const pois = (l, k) => Math.exp(-l) * l ** k / [...Array(k).keys()].reduce((a, i) => a * (i + 1), 1);
  for (let k = 0; k < 30; k++) pTie += pois(m0, k) * pois(m1, k);
  R.tiePoissonExpected = pTie;
  R.goalDispersion = R.goals.sd ** 2 / R.goals.mean;
  // symmetry: both teams are AI-controlled, so they should be equal
  R.team0Goals = describe(col('t0Goals')); R.team1Goals = describe(col('t1Goals'));
  R.team0WinShare = games.filter((g) => g.score[0] > g.score[1]).length / games.length;
  // reconciliation identities
  R.identities = {
    scoreEqualsGoalEvents: ok.filter((g) => g.score[0] + g.score[1] === (g.logCounts.goal || 0) || g.result === 'SO').length / ok.length,
    simShotsEqualsObserved: ok.filter((g) => g.stats[0].shots + g.stats[1].shots === g.shots.length).length / ok.length,
    attemptsDecompose: ok.filter((g, i) => { const d = D[i]; return d.attempts === d.goalsFromShots + d.saves + d.missed + d.blocked + d.blockedTeammate + d.short + d.other; }).length / ok.length,
    simSavesMinusLineageSaves: sum(ok.map((g, i) => D[i].statsSaves - D[i].saves)) / ok.length,
    passesDecompose: ok.filter((g, i) => D[i].passes === D[i].completions + D[i].intercepted + D[i].passOther).length / ok.length,
    faceoffsEqualStartsGoalsFreezes: ok.filter((g, i) => { const per = g.stoppages.filter((s) => s.reason === 'period').length; const suddenDeathWinner = g.result === 'OT' && g.goals.some((x) => x.period > 3) ? 1 : 0; return D[i].faceoffs === 1 + per + g.stoppages.filter((s) => s.reason === 'goal' || s.reason === 'freeze').length - suddenDeathWinner; }).length / ok.length,
    goalsNotFromShots: sum(col('goalsNonShot')),
    issues: ok.flatMap((g) => g.issues).reduce((c, x) => ((c[x.kind] = (c[x.kind] || 0) + 1), c), {}),
  };
  // conditionals over all shots
  const shots = ok.flatMap((g) => g.shots);
  const DB = [0, 6, 10, 15, 20, 61], DL = ['0-6 m', '6-10', '10-15', '15-20', '20+'];
  const bin = (d) => DB.findIndex((e, i) => d >= e && d < DB[i + 1]);
  R.byDistance = DL.map((lab, i) => {
    const s = shots.filter((x) => bin(x.dist) === i), on = s.filter((x) => x.outcome === 'goal' || (x.outcome === 'save' && x.onTarget)), g = s.filter((x) => x.outcome === 'goal');
    return { bin: lab, share: s.length / shots.length, onTargetPred: s.filter((x) => x.onTarget).length / Math.max(1, s.length), sh: g.length / Math.max(1, on.length), blocked: s.filter((x) => x.outcome.startsWith('blocked')).length / Math.max(1, s.length), n: s.length };
  });
  R.byKind = ['wrist', 'slap'].map((k) => { const s = shots.filter((x) => x.kind === k), on = s.filter((x) => x.outcome === 'goal' || (x.outcome === 'save' && x.onTarget)); return { kind: k, share: s.length / shots.length, sh: s.filter((x) => x.outcome === 'goal').length / Math.max(1, on.length), onTarget: on.length / Math.max(1, s.length), meanDist: mean(s.map((x) => x.dist)), n: s.length }; });
  const reb = shots.filter((x) => x.rebound), rebOn = reb.filter((x) => x.outcome === 'goal' || (x.outcome === 'save' && x.onTarget));
  R.rebound = { n: reb.length, sh: reb.filter((x) => x.outcome === 'goal').length / Math.max(1, rebOn.length) };
  R.byScoreState = [-1, 0, 1].map((st) => ({ state: { '-1': 'trailing', 0: 'tied', 1: 'leading' }[st], share: shots.filter((x) => x.scoreState === st).length / shots.length }));
  R.outcomes = shots.reduce((c, x) => ((c[x.outcome] = (c[x.outcome] || 0) + 1), c), {});
  R.goalsByPeriod = [1, 2, 3].map((p) => mean(ok.map((g) => (g.periodGoals[p] ? g.periodGoals[p][0] + g.periodGoals[p][1] : 0))));
  const passes = ok.flatMap((g) => g.passes), PB = [0, 6, 12, 18, 25, 60], PL = ['0-6 m', '6-12', '12-18', '18-25', '25+'];
  R.passByDist = PL.map((lab, i) => { const s = passes.filter((p) => p.dist >= PB[i] && p.dist < PB[i + 1]); return { bin: lab, share: s.length / passes.length, completion: s.filter((p) => p.outcome && p.outcome.startsWith('complete')).length / Math.max(1, s.length), n: s.length }; });
  R.passOutcomes = passes.reduce((c, p) => ((c[p.outcome] = (c[p.outcome] || 0) + 1), c), {});
  const poss = ok.flatMap((g) => g.poss);
  R.possEnd = poss.reduce((c, p) => ((c[p.end] = (c[p.end] || 0) + 1), c), {});
  R.possDur = describe(poss.map((p) => p.dur)); R.shotsPerPoss = sum(poss.map((p) => p.shots)) / poss.length; R.passesPerPoss = sum(poss.map((p) => p.passes)) / poss.length;
  R.faceoffAfter = ok.flatMap((g) => g.faceoffs).reduce((c, x) => ((c[x.after] = (c[x.after] || 0) + 1), c), {});
  R.faceoffWinTeam0 = ok.flatMap((g) => g.faceoffs).filter((x) => x.winTeam === 0).length / ok.flatMap((g) => g.faceoffs).length;
  out.sets[set] = R;

  // ---------------- charts for this set
  const c = [];
  const GE = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 24];
  c.push(bars(`${set}-total-goals.svg`, `Total goals per game (${set}, n=${ok.length})`, GE.slice(0, -1).map((e, i) => `${e}-${GE[i + 1] - 1}`), [{ name: 'Rink ’95 games', values: hist(col('goals'), GE), color: '#3f74d6' }], { yfmt: (v) => pct(v, 0) }));
  c.push(bars(`${set}-shot-funnel.svg`, 'Where shot attempts end (share of attempts)', ['on goal', 'missed', 'blocked', 'other'], [
    { name: "Rink '95", values: [R.onGoalShare.value, R.missShare.value, R.blockShare.value, R.otherShare.value], color: '#3f74d6' },
    { name: 'NHL 2024-25', values: [N24.on_goal_share_of_attempts.value, N24.missed_share_of_attempts.value, N24.blocked_share_of_attempts.value, 0], color: '#c8323a' },
    { name: 'NHL 2025-26', values: [N25.on_goal_share_of_attempts.value, N25.missed_share_of_attempts.value, N25.blocked_share_of_attempts.value, 0], color: '#e6a23c' }], { yfmt: (v) => pct(v, 0) }));
  c.push(bars(`${set}-sh-by-distance.svg`, 'Shooting % on true shots on goal, by distance', R.byDistance.map((b) => b.bin), [{ name: 'goals / on-target shots', values: R.byDistance.map((b) => b.sh), color: '#3f74d6' }, { name: 'share of attempts', values: R.byDistance.map((b) => b.share), color: '#9fb2c4' }], { yfmt: (v) => pct(v, 0), note: 'no NHL reference extracted yet' }));
  c.push(bars(`${set}-per60.svg`, 'Counts per 60 minutes of play (both teams)', ['goals', 'attempts', 'on goal', 'missed', 'blocked', 'hits', 'faceoffs'], [
    { name: "Rink '95", values: ['goals', 'attempts', 'sogTrue', 'missed', 'blocked', 'hits', 'faceoffs'].map((k) => R[k + '_per60'].mean), color: '#3f74d6' },
    { name: 'NHL 2024-25 per game', values: [N24.goals_per_game.value, N24.attempts_per_game.value, N24.sog_per_game.value, N24.missed_per_game.value, N24.blocked_per_game.value, N24.hits_per_game.value, N24.faceoffs_per_game.value], color: '#c8323a' }], { note: 'NHL games are about 60-61 min' }));
  c.push(bars(`${set}-pass-by-distance.svg`, 'Pass completion by distance', R.passByDist.map((b) => b.bin), [{ name: 'completion', values: R.passByDist.map((b) => b.completion), color: '#3f74d6' }, { name: 'share of passes', values: R.passByDist.map((b) => b.share), color: '#9fb2c4' }], { yfmt: (v) => pct(v, 0), note: 'no NHL reference exists' }));
  const PE = [0, 1, 2, 3, 4, 6, 8, 12, 20, 60];
  c.push(bars(`${set}-possession.svg`, 'Possession length (s)', PE.slice(0, -1).map((e, i) => `${e}-${PE[i + 1]}`), [{ name: 'possessions', values: hist(poss.map((p) => p.dur), PE), color: '#3f74d6' }], { yfmt: (v) => pct(v, 0) }));
  R.charts = c;
}

// ---------------------------------------------------------------- markdown
const T = out.sets.train || Object.values(out.sets)[0], H = out.sets.holdout;
const row = (name, key, fmt, refs) => `| ${name} | ${T ? fmt(T, key) : ''} | ${H ? fmt(H, key) : ''} | ${refs} |`;
const dm = (R, k) => `${f(R[k].mean, 1)} [${f(R[k].ci[0], 1)}, ${f(R[k].ci[1], 1)}] · sd ${f(R[k].sd, 1)} · p5–p95 ${f(R[k].p5, 0)}–${f(R[k].p95, 0)}`;
const dr = (R, k, d = 1) => `${pct(R[k].value, d)} [${pct(R[k].ci[0], d)}, ${pct(R[k].ci[1], d)}]`;
md.push('## 1. Run integrity', '');
md.push('| | train | holdout |', '|---|---|---|');
md.push(`| games / completed / errors | ${T.n} / ${T.completed} / ${T.errors} | ${H ? `${H.n} / ${H.completed} / ${H.errors}` : ''} |`);
md.push(`| result REG / OT / SO | ${T.results.REG || 0} / ${T.results.OT || 0} / ${T.results.SO || 0} | ${H ? `${H.results.REG || 0} / ${H.results.OT || 0} / ${H.results.SO || 0}` : ''} |`);
md.push(`| clock time in play (s), mean | ${f(T.inPlay.mean, 1)} | ${H ? f(H.inPlay.mean, 1) : ''} |`);
md.push(`| sim time incl. stoppages (s), mean · p95 | ${f(T.simT.mean, 0)} · ${f(T.simT.p95, 0)} | ${H ? `${f(H.simT.mean, 0)} · ${f(H.simT.p95, 0)}` : ''} |`);
md.push(`| compute per game (ms), mean | ${f(T.wallMs.mean, 0)} | ${H ? f(H.wallMs.mean, 0) : ''} |`, '');
md.push('## 2. Identities (measurement integrity)', '');
md.push('Share of games where each identity holds exactly (train). Anything below 100% or non-zero is a lineage defect to explain, not noise.', '');
md.push('| Identity | Result |', '|---|---|');
const I = T.identities;
md.push(`| score = number of goal events | ${pct(I.scoreEqualsGoalEvents)} |`);
md.push(`| sim shot counter = observed shot attempts | ${pct(I.simShotsEqualsObserved)} |`);
md.push(`| attempts = goals + saves + missed + blocked + blocked-by-teammate + short + other | ${pct(I.attemptsDecompose)} |`);
md.push(`| passes = completions + interceptions + other | ${pct(I.passesDecompose)} |`);
md.push(`| faceoffs = opening + period starts + goals + freezes | ${pct(I.faceoffsEqualStartsGoalsFreezes)} |`);
md.push(`| sim save counter minus lineage saves, per game | ${f(I.simSavesMinusLineageSaves, 2)} (saves the sim credits that the observer cannot tie to a live shot) |`);
md.push(`| goals not from a tracked shot (total, all games) | ${I.goalsNotFromShots} |`);
md.push(`| observer issues | ${Object.entries(I.issues).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'} |`, '');
md.push('## 3. Headline comparison', '');
md.push('Train and holdout: mean [95% CI] for counts, ratio [bootstrap 95% CI] for rates. NHL values are all situations, regular season, both teams, per full game; Rink ’95 regulation is 9 minutes of clock with no penalties, so **shares and percentages are the fair comparison**; counts are shown per 60 minutes of play only as a pacing indicator.', '');
md.push('| Measure | Rink ’95 train | Rink ’95 holdout | NHL 2024-25 · 2025-26 |', '|---|---|---|---|');
md.push(row('shot attempts on goal (true, on target)', 'onGoalShare', (R, k) => dr(R, k), `${pct(N24.on_goal_share_of_attempts.value)} · ${pct(N25.on_goal_share_of_attempts.value)}`));
md.push(row('shot attempts on goal (as the sim credits them)', 'onGoalShareCredited', (R, k) => dr(R, k), ''));
md.push(row('shot attempts missed', 'missShare', (R, k) => dr(R, k), `${pct(N24.missed_share_of_attempts.value)} · ${pct(N25.missed_share_of_attempts.value)}`));
md.push(row('shot attempts blocked (incl. by teammate)', 'blockShare', (R, k) => dr(R, k), `${pct(N24.blocked_share_of_attempts.value)} · ${pct(N25.blocked_share_of_attempts.value)}`));
md.push(row('save % (true shots on goal)', 'svTrue', (R, k) => dr(R, k), `${pct(N24.save_pct.value)} · ${pct(N25.save_pct.value)} (excl. empty net)`));
md.push(row('save % (as the sim credits it)', 'svCredited', (R, k) => dr(R, k), ''));
md.push(row('saves of shots that were going wide', 'phantomSaveShare', (R, k) => dr(R, k), 'not applicable (scorers don’t credit them)'));
md.push(row('shooting % on true shots on goal', 'shTrue', (R, k) => dr(R, k), `about ${pct(N24.shooting_pct_on_goal.value)} (2024-25, excl. EN)`));
md.push(row('games past regulation', 'pastRegulation', (R, k) => pct(R[k]), `${pct(N24.past_regulation_share.value)} · ${pct(N25.past_regulation_share.value)}`));
md.push(row('games to a shootout', 'shootout', (R, k) => pct(R[k]), `${pct(N24.shootout_share.value)} · ${pct(N25.shootout_share.value)}`));
md.push(row('pass completion', 'passCompletion', (R, k) => dr(R, k), 'not published'));
md.push(row('check attempts that make contact', 'checkContactRate', (R, k) => dr(R, k), 'not published'));
md.push(row('hits per check attempt', 'hitPerAttempt', (R, k) => dr(R, k), 'not published'));
md.push(row('goals not from a tracked shot', 'nonShotGoalShare', (R, k) => dr(R, k), ''));
md.push(row('shot attempts that are rebounds (≤3 s after a rebound save)', 'reboundShare', (R, k) => dr(R, k), 'needs shot-level data'), '');
if (T.penaltiesOn) {
  md.push('Penalties and special teams:', '');
  md.push('| Measure | Rink ’95 train | Rink ’95 holdout | NHL 2024-25 · 2025-26 |', '|---|---|---|---|');
  md.push(`| penalties (power-play opportunities) per team per game | ${f(T.penaltiesPerTeamGame, 2)} | ${H ? f(H.penaltiesPerTeamGame, 2) : ''} | ${N24.pp_opportunities_per_team_game.value} · ${N25.pp_opportunities_per_team_game.value} (per full game) |`);
  md.push(`| power-play conversion | ${pct(T.ppPct)} | ${H ? pct(H.ppPct) : ''} | ${pct(N24.pp_pct.value)} · ${pct(N25.pp_pct.value)} |`);
  md.push(`| goals by strength | ${Object.entries(T.goalsByStrength).map(([k, v]) => `${k} ${v}`).join(', ')} | | |`);
  md.push(`| time at each strength | ${Object.entries(T.strengthShare).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v)}`).join(', ')} | | |`);
  md.push(`| penalty kinds | ${Object.entries(T.penaltyKinds).map(([k, v]) => `${k} ${v}`).join(', ')} | | |`);
  md.push(`| how penalties ended | ${Object.entries(T.penaltyEnds).map(([k, v]) => `${k} ${v}`).join(', ')} | | |`, '');
}
md.push('Per game (Rink ’95, 9-minute game) and per 60 minutes of play:', '');
md.push('| Count | per game: mean [CI] · sd · p5–p95 | per 60 min of play | NHL 2024-25 per game |', '|---|---|---|---|');
for (const [name, k, ref] of [['goals', 'goals', N24.goals_per_game.value], ['shot attempts', 'attempts', N24.attempts_per_game.value], ['true shots on goal', 'sogTrue', N24.sog_per_game.value], ['missed', 'missed', N24.missed_per_game.value], ['blocked', 'blocked', N24.blocked_per_game.value], ['hits', 'hits', N24.hits_per_game.value], ['faceoffs', 'faceoffs', N24.faceoffs_per_game.value]])
  md.push(`| ${name} | ${dm(T, k)} | ${f(T[k + '_per60'].mean, 1)} | ${f(ref, 1)} |`);
for (const [name, k] of [['check attempts', 'checkAttempts'], ['check contacts', 'checkContacts'], ['passes', 'passes'], ['freezes (goalie covers)', 'freezes'], ['posts', 'posts'], ['possessions', 'poss'], ['goal margin', 'margin']]) md.push(`| ${name} | ${dm(T, k)} | | |`);
md.push('');
md.push('## 4. Distributions and conditionals (train)', '');
for (const c of T.charts) md.push(`![${c}](${c})`, '');
md.push(`- **Goal dispersion** (variance / mean of total goals): ${f(T.goalDispersion, 2)}. A Poisson process gives 1.0.`);
md.push(`- **Tie after regulation:** ${pct(T.pastRegulation)} observed vs ${pct(T.tiePoissonExpected)} expected if each team's goals were independent Poisson at the observed means (${f(T.team0Goals.mean, 2)} and ${f(T.team1Goals.mean, 2)}).`);
md.push(`- **Symmetry** (both teams are AI): team 0 wins ${pct(T.team0WinShare)} of games; goals ${f(T.team0Goals.mean, 2)} vs ${f(T.team1Goals.mean, 2)}; team 0 wins ${pct(T.faceoffWinTeam0)} of faceoffs.`);
md.push(`- **Goals by period:** ${T.goalsByPeriod.map((x) => f(x, 2)).join(' / ')}.`);
md.push(`- **Shot type:** ${T.byKind.map((k) => `${k.kind} ${pct(k.share)} of attempts, mean distance ${f(k.meanDist, 1)} m, ${pct(k.onTarget)} on target, shooting % ${pct(k.sh)}`).join('; ')}.`);
md.push(`- **Rebound shots:** ${T.rebound.n} (${pct(T.reboundShare.value)} of attempts), shooting % ${pct(T.rebound.sh)}.`);
md.push(`- **Shots by score state of the shooting team:** ${T.byScoreState.map((s) => `${s.state} ${pct(s.share)}`).join(', ')} (share of attempts; time in each state is not yet measured, so this is not a score-effect rate).`);
md.push(`- **Possessions:** median ${f(T.possDur.median, 1)} s (p95 ${f(T.possDur.p95, 1)} s), ${f(T.shotsPerPoss, 2)} shots and ${f(T.passesPerPoss, 2)} passes per possession. How they end: ${Object.entries(T.possEnd).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v / Object.values(T.possEnd).reduce((a, b) => a + b, 0))}`).join(', ')}.`);
md.push(`- **Faceoffs follow:** ${Object.entries(T.faceoffAfter).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
md.push(`- **Shot outcomes (all train shots):** ${Object.entries(T.outcomes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
md.push(`- **Pass outcomes:** ${Object.entries(T.passOutcomes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '');
md.push('| Distance | share of attempts | predicted on target | blocked | shooting % on target | n |', '|---|---|---|---|---|---|');
for (const b of T.byDistance) md.push(`| ${b.bin} | ${pct(b.share)} | ${pct(b.onTargetPred)} | ${pct(b.blocked)} | ${pct(b.sh)} | ${b.n} |`);
md.push('');
md.push('## 5. Train vs holdout', '');
md.push('| Measure | train | holdout | difference |', '|---|---|---|---|');
if (H) for (const k of ['onGoalShare', 'missShare', 'blockShare', 'svTrue', 'shTrue', 'passCompletion', 'hitPerAttempt']) md.push(`| ${k} | ${pct(T[k].value)} | ${pct(H[k].value)} | ${f(100 * (H[k].value - T[k].value), 2)} pts |`);
if (H) for (const k of ['goals', 'attempts', 'hits', 'faceoffs']) md.push(`| ${k} per game | ${f(T[k].mean, 2)} | ${f(H[k].mean, 2)} | ${f(H[k].mean - T[k].mean, 2)} |`);
md.push('');
md.push('References and their sources: `calibration/references.json`. Unavailable references are listed there under `unavailable` rather than estimated.');
writeFileSync(path.join(OUT, 'REPORT.md'), md.join('\n'));
const slim = JSON.parse(JSON.stringify(out, (k, v) => (k === 'charts' ? undefined : v)));
writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(slim, null, 1));
appendFileSync(path.join(OUT, 'history.jsonl'), JSON.stringify({ when: new Date().toISOString(), tag: TAG, commits: [...new Set(metas.map((m) => m.commit))], train: T && { n: T.n, goals: T.goals.mean, onGoalShare: T.onGoalShare.value, missShare: T.missShare.value, blockShare: T.blockShare.value, svTrue: T.svTrue.value, shTrue: T.shTrue.value, pastRegulation: T.pastRegulation, hits: T.hits.mean, faceoffs: T.faceoffs.mean, passCompletion: T.passCompletion.value }, holdout: H && { n: H.n, goals: H.goals.mean, onGoalShare: H.onGoalShare.value, svTrue: H.svTrue.value, pastRegulation: H.pastRegulation } }) + '\n');
console.log('wrote REPORT.md, summary.json, charts/, history.jsonl');
