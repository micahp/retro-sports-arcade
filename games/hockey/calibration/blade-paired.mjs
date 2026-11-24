// Blade paired-seed experiment: the same seeds with the legacy blade (A) and the planar blade (B).
// Experiment only; nothing is tuned. Metrics per game, paired difference B - A with a bootstrap 95% CI.
//   node calibration/blade-paired.mjs --n 100 [--start 1] [--out file.md]
import { createGame, step } from '../src/sim.js';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const N = +(args.n || 50), START = +(args.start || 1);
function game(seed, blade) {
  const S = createGame('regulation', `blade-${seed}`, { auto: true, penalties: false, engine: { blade } });
  for (let i = 0; i < 60 * 60 * 40 && S.phase !== 'final'; i++) step(S, {});
  const [h, a] = S.stats;
  return { goals: S.score[0] + S.score[1], shots: h.shots + a.shots, hits: h.hits + a.hits, passes: h.passesDone + a.passesDone };
}
const rows = []; const t0 = Date.now();
for (let k = START; k < START + N; k++) rows.push({ A: game(k, 'legacy'), B: game(k, 'planar') });
const secs = (Date.now() - t0) / 1000;
function boot(xs, B = 2000) {
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const draws = [];
  for (let b = 0; b < B; b++) { const s = []; for (let i = 0; i < xs.length; i++) s.push(xs[Math.floor(rnd() * xs.length)]); draws.push(mean(s)); }
  draws.sort((p, q) => p - q);
  return { mean: mean(xs), lo: draws[Math.floor(0.025 * B)], hi: draws[Math.floor(0.975 * B) - 1] };
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const out = [`# Blade paired-seed experiment (legacy vs planar), preliminary\n`,
  `Seeds ${START}–${START + N - 1}, regulation, penalties off, auto AI, skating/cadence/roster legacy. Runtime ${secs.toFixed(0)} s.\n`,
  `| metric | legacy mean | planar mean | planar − legacy (paired, 95% CI) |`, `|---|---|---|---|`];
for (const m of ['goals', 'shots', 'hits', 'passes']) {
  const a = rows.map((r) => r.A[m]), b = rows.map((r) => r.B[m]);
  const d = rows.map((r, i) => b[i] - a[i]), c = boot(d);
  out.push(`| ${m} per game | ${mean(a).toFixed(2)} | ${mean(b).toFixed(2)} | ${c.mean >= 0 ? '+' : ''}${c.mean.toFixed(2)} [${c.lo.toFixed(2)}, ${c.hi.toFixed(2)}] |`);
}
const text = out.join('\n') + '\n'; console.log(text);
if (args.out) (await import('node:fs')).writeFileSync(args.out, text);
