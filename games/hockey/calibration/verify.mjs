// The observer must not change the game: same seed, with and without it, must give identical logs and final states.
import { createGame, step } from '../src/sim.js';
import { createObserver } from './observer.mjs';
const N = +(process.argv[2] || 12);
const play = (seed, observe) => {
  const S = createGame('regulation', seed, { auto: true }); const O = observe ? createObserver(S) : null;
  for (let i = 0; i < 60 * 60 * 30 && S.phase !== 'final'; i++) { step(S, {}); if (O) O.tick(); }
  return JSON.stringify({ log: S.log, score: S.score, t: S.t, sk: S.skaters.map((p) => [p.x, p.z, p.vx, p.vz]), stats: S.stats });
};
let bad = 0;
for (let k = 0; k < N; k++) { const a = play('verify-' + k, false), b = play('verify-' + k, true); if (a !== b) { bad++; console.log('DIFFERS', k); } }
console.log(bad ? `observer changed ${bad}/${N} games` : `observer is non-invasive: ${N}/${N} games identical with and without it`);
process.exitCode = bad ? 1 : 0;
