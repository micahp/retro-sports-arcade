// Existing modes must play identically to an older checkout (same seeds, full logs and scores),
// with penalties on and off, so baselines measured there stay valid.
//   node calibration/verify-modes-unchanged.mjs <path to an old games/hockey checkout> [n]
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const old = process.argv[2], N = +(process.argv[3] || 10);
const A = await import(pathToFileURL(path.join(old, 'src/sim.js')).href);
const B = await import('../src/sim.js');
const play = (M, mode, seed, opts) => {
  const S = M.createGame(mode, seed, { auto: true, ...opts });
  for (let i = 0; i < 60 * 60 * 40 && S.phase !== 'final'; i++) M.step(S, {});
  return JSON.stringify({ log: S.log, score: S.score });
};
let same = 0, total = 0;
for (const [mode, opts] of [['regulation', { penalties: false }], ['regulation', { penalties: true }], ['pp', {}], ['en', {}], ['ot3', {}]]) {
  for (let k = 0; k < N; k++) {
    total++;
    if (play(A, mode, 'train-' + k, opts) === play(B, mode, 'train-' + k, opts)) same++;
    else console.log(`differs: ${mode} ${JSON.stringify(opts)} train-${k}`);
  }
}
console.log(`${same}/${total} games identical to the old checkout`);
process.exitCode = same === total ? 0 : 1;
