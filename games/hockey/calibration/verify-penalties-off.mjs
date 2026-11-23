// With penalties off, the game must be identical to the commit before penalties existed,
// so baselines measured there stay valid as the 'penalties off' configuration.
//   node calibration/verify-penalties-off.mjs <path to an old games/hockey checkout> [n]
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const old = process.argv[2], N = +(process.argv[3] || 10);
const A = await import(pathToFileURL(path.join(old, 'src/sim.js')).href);
const B = await import('../src/sim.js');
const play = (M, seed, opts) => { const S = M.createGame('regulation', seed, { auto: true, ...opts }); for (let i = 0; i < 60 * 60 * 30 && S.phase !== 'final'; i++) M.step(S, {}); return JSON.stringify({ log: S.log.map((e) => { const { strength, manpower, ...r } = e; return r; }), score: S.score }); };
let same = 0;
for (let k = 0; k < N; k++) if (play(A, 'train-' + k, {}) === play(B, 'train-' + k, { penalties: false })) same++; else console.log('differs: train-' + k);
console.log(`${same}/${N} games identical to the old commit with penalties off`);
process.exitCode = same === N ? 0 : 1;
