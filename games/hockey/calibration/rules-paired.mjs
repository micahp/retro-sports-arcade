// Offside and icing paired-seed experiment: the same seeds with rules 'none' (A) and 'nhl95' (B).
// Rates are per 60 game-minutes (regulation game time, from the game clock). Reference rates come from the
// NHL 95 logs (G100v4 stoppage counts, see research/nhl95-reference-study/analysis).
//   node calibration/rules-paired.mjs --n 100 [--start 1] [--out file.md]
import { createGame, step } from '../src/sim.js';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const N = +(args.n || 50), START = +(args.start || 1);
function game(seed, rules) {
  const S = createGame('regulation', `rules-${seed}`, { auto: true, penalties: false, engine: { rules } });
  let offsideN = 0, icingN = 0;
  for (let i = 0; i < 60 * 60 * 40 && S.phase !== 'final'; i++) {
    step(S, {});
    for (const e of S.events) { if (e.type === 'offside') offsideN++; else if (e.type === 'icing') icingN++; }
  }
  const mins = (S.periodSec * S.mode.periods) / 60;   // regulation game-minutes (the clock counts game seconds)
  const [h, a] = S.stats;
  return { mins, goals: S.score[0] + S.score[1], shots: h.shots + a.shots, offside: offsideN, icing: icingN };
}
const rows = []; const t0 = Date.now();
for (let k = START; k < START + N; k++) rows.push({ A: game(k, 'none'), B: game(k, 'nhl95') });
const secs = (Date.now() - t0) / 1000;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
function boot(xs, B = 2000) {
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const d = []; for (let b = 0; b < B; b++) { const s = []; for (let i = 0; i < xs.length; i++) s.push(xs[Math.floor(rnd() * xs.length)]); d.push(mean(s)); }
  d.sort((p, q) => p - q); return { mean: mean(xs), lo: d[Math.floor(0.025 * B)], hi: d[Math.floor(0.975 * B) - 1] };
}
const rate = (rs, k, side) => rs.reduce((s, r) => s + r[side][k], 0) / rs.reduce((s, r) => s + r[side].mins, 0) * 60;
const out = [`# Offside and icing, paired seeds (preliminary)\n`,
  `Seeds ${START}–${START + N - 1}, regulation (3 x 10 min), penalties off, auto AI. A = rules none, B = rules nhl95. Runtime ${secs.toFixed(0)} s.\n`,
  `| per 60 game-minutes | A (no rules) | B (nhl95) | B − A |`, `|---|---|---|---|`];
for (const k of ['goals', 'shots', 'offside', 'icing']) {
  const pairs = rows.map((r) => (r.B[k] / r.B.mins * 60) - (r.A[k] / r.A.mins * 60));
  const c = boot(pairs);
  out.push(`| ${k} | ${rate(rows, k, 'A').toFixed(2)} | ${rate(rows, k, 'B').toFixed(2)} | ${c.mean >= 0 ? '+' : ''}${c.mean.toFixed(2)} [${c.lo.toFixed(2)}, ${c.hi.toFixed(2)}] |`);
}
const text = out.join('\n') + '\n'; console.log(text);
if (args.out) (await import('node:fs')).writeFileSync(args.out, text);
