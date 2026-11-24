// Offside and icing, paired seeds across rule variants, so each change can be credited separately.
//   A   no rules
//   V1  rules, first-version geometry: one threshold at NHL 95's 82 units (offsideLine ref82, offsideTol none)
//   V2  rules, the drawn blue line (25 ft), one threshold                  (offsideLine rink, offsideTol none)
//   V3  rules, the drawn line with NHL 95's flag / clear / call depths      (offsideLine rink, offsideTol nhl95)
//   V4  V3 with the game clock at NHL 95's 2.43x                           (clockRate 2.43)
// Rates are per 60 minutes of game clock actually run (the clock stops at whistles), the way the NHL 95 logs are
// counted. Experiment only: nothing is tuned.
//   node calibration/rules-paired.mjs --n 100 [--start 1] [--out file.md]
import { createGame, step } from '../src/sim.js';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const N = +(args.n || 50), START = +(args.start || 1);
const VARIANTS = {
  A: { rules: 'none' },
  V1: { rules: 'nhl95', offsideLine: 'ref82', offsideTol: 'none' },
  V2: { rules: 'nhl95', offsideLine: 'rink', offsideTol: 'none' },
  V3: { rules: 'nhl95', offsideLine: 'rink', offsideTol: 'nhl95' },
  V4: { rules: 'nhl95', offsideLine: 'rink', offsideTol: 'nhl95', clockRate: 2.43 },
};
function game(seed, engine) {
  const S = createGame('regulation', `rules-${seed}`, { auto: true, penalties: false, engine });
  let offside = 0, icing = 0, clockSec = 0, prev = S.clock;
  for (let i = 0; i < 60 * 60 * 40 && S.phase !== 'final'; i++) {
    step(S, {});
    if (S.clock < prev) clockSec += prev - S.clock;          // game clock consumed (a new period resets it upward)
    prev = S.clock;
    for (const e of S.events) { if (e.type === 'offside') offside++; else if (e.type === 'icing') icing++; }
  }
  const [h, a] = S.stats;
  return { mins: clockSec / 60, physMins: S.t / 60, goals: S.score[0] + S.score[1], shots: h.shots + a.shots, offside, icing };
}
const rows = []; const t0 = Date.now();
for (let k = START; k < START + N; k++) rows.push(Object.fromEntries(Object.entries(VARIANTS).map(([v, e]) => [v, game(k, e)])));
const secs = (Date.now() - t0) / 1000;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
function boot(xs, B = 2000) {
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const d = []; for (let b = 0; b < B; b++) { const s = []; for (let i = 0; i < xs.length; i++) s.push(xs[Math.floor(rnd() * xs.length)]); d.push(mean(s)); }
  d.sort((p, q) => p - q); return { lo: d[Math.floor(0.025 * B)], hi: d[Math.floor(0.975 * B) - 1] };
}
const rate = (v, k) => rows.reduce((s, r) => s + r[v][k], 0) / rows.reduce((s, r) => s + r[v].mins, 0) * 60;
const ci = (v, k) => { const b = boot(rows.map((r) => r[v][k] / r[v].mins * 60)); return `[${b.lo.toFixed(1)}, ${b.hi.toFixed(1)}]`; };
const out = [`# Offside and icing by rule variant, paired seeds (preliminary)\n`,
  `Seeds ${START}–${START + N - 1}, mode 'regulation' (3 x 3 min periods), penalties off, auto AI, other engine options legacy. Runtime ${secs.toFixed(0)} s.`,
  `Rates per 60 minutes of game clock run (95% CI over seeds). NHL 95 reference (G100 logs, 10-min periods): offside ~12, icing ~0.3-0.8, goals ~7 per 60.\n`,
  `| per 60 game-clock min | ${Object.keys(VARIANTS).join(' | ')} |`, `|---|${Object.keys(VARIANTS).map(() => '---').join('|')}|`];
for (const k of ['offside', 'icing', 'goals', 'shots']) out.push(`| ${k} | ${Object.keys(VARIANTS).map((v) => `${rate(v, k).toFixed(1)} ${ci(v, k)}`).join(' | ')} |`);
out.push(`| physics min per game | ${Object.keys(VARIANTS).map((v) => mean(rows.map((r) => r[v].physMins)).toFixed(1)).join(' | ')} |`);
const text = out.join('\n') + '\n'; console.log(text);
if (args.out) (await import('node:fs')).writeFileSync(args.out, text);
