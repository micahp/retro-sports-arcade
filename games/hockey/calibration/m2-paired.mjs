// M2 paired-seed experiment. The same seeds under three engine configs:
//   A  legacy skating, neutral roster          (baseline)
//   B  rated skating, neutral roster           (must equal A exactly: identity check)
//   C  rated skating, spread roster            (the M2 change, experiment only, nothing calibrated)
// Reports paired differences (C - A) with a bootstrap 95% CI over seeds. Not a fit: no parameter is tuned.
//   node calibration/m2-paired.mjs --n 200 [--start 1]
import { createGame, step } from '../src/sim.js';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const N = +(args.n || 50), START = +(args.start || 1);
const CONFIGS = { A: { skating: 'legacy', roster: 'neutral' }, B: { skating: 'rated', roster: 'neutral' }, C: { skating: 'rated', roster: 'spread' } };

function game(seed, engine) {
  const S = createGame('regulation', `m2-${seed}`, { auto: true, penalties: false, engine });
  let topSpeed = 0;
  for (let i = 0; i < 60 * 60 * 40 && S.phase !== 'final'; i++) {
    step(S, {});
    if (i % 60 === 0) for (const p of S.skaters) if (!p.isG) topSpeed = Math.max(topSpeed, Math.hypot(p.vx, p.vz));
  }
  const [h, a] = S.stats;
  return { goals: S.score[0] + S.score[1], shots: h.shots + a.shots, hits: h.hits + a.hits, topSpeed, log: JSON.stringify(S.log) };
}

const rows = [];
const t0 = Date.now();
for (let k = START; k < START + N; k++) {
  const r = {};
  for (const [name, engine] of Object.entries(CONFIGS)) r[name] = game(k, engine);
  rows.push({ seed: k, ...Object.fromEntries(Object.entries(r).map(([n, v]) => [n, { goals: v.goals, shots: v.shots, hits: v.hits, topSpeed: v.topSpeed }])), identityAB: r.A.log === r.B.log });
}
const secs = (Date.now() - t0) / 1000;

function boot(xs, B = 2000) {
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const draws = [];
  for (let b = 0; b < B; b++) { const s = []; for (let i = 0; i < xs.length; i++) s.push(xs[Math.floor(rnd() * xs.length)]); draws.push(mean(s)); }
  draws.sort((p, q) => p - q);
  return { mean: mean(xs), lo: draws[Math.floor(0.025 * B)], hi: draws[Math.floor(0.975 * B) - 1] };
}
const fmt = (d) => `${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(2)} [${d.lo.toFixed(2)}, ${d.hi.toFixed(2)}]`;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

const identity = rows.every((r) => r.identityAB);
const out = [];
out.push(`# M2 paired-seed experiment (preliminary, no fitting)\n`);
out.push(`Seeds ${START}–${START + N - 1}, regulation, penalties off, auto AI. A = legacy/neutral, B = rated/neutral, C = rated/spread.`);
out.push(`Identity check (A == B event logs, all seeds): ${identity ? 'PASS' : 'FAIL'}.  Runtime ${secs.toFixed(0)} s.\n`);
out.push(`| metric | A mean | C mean | C − A (paired, 95% CI) |`);
out.push(`|---|---|---|---|`);
for (const m of ['goals', 'shots', 'hits', 'topSpeed']) {
  const a = rows.map((r) => r.A[m]), c = rows.map((r) => r.C[m]);
  const d = rows.map((r, i) => c[i] - a[i]);
  const digits = m === 'topSpeed' ? 2 : 2;
  out.push(`| ${m}${m === 'topSpeed' ? ' (m/s, max over skaters)' : ' per game'} | ${mean(a).toFixed(digits)} | ${mean(c).toFixed(digits)} | ${fmt(boot(d))} |`);
}
const text = out.join('\n') + '\n';
console.log(text);
if (args.out) (await import('node:fs')).writeFileSync(args.out, text);
process.exitCode = identity ? 0 : 1;
