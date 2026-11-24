// M2: attribute-dependent skating. Neutral ratings must reproduce legacy skating exactly; a spread roster
// with engine.skating = 'rated' must change play; the factors must have the designed direction.
import { createGame, step } from '../src/sim.js';
import { skateFactors, SKATING_SPREAD } from '../src/skating.js';
import { neutralRatings } from '../src/ratings.js';
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++; };

// 1. neutral factors are exactly 1
const n = skateFactors(neutralRatings(false));
check(n.top === 1 && n.accel === 1 && n.edges === 1 && n.turn === 1, 'neutral player: every skating factor is exactly 1');

// 2. direction: faster, more agile, lighter skaters get bigger factors
const fast = skateFactors({ ...neutralRatings(false), speed: 90, agility: 90, weight: 75 });
const slow = skateFactors({ ...neutralRatings(false), speed: 20, agility: 20, weight: 110 });
check(fast.top > 1 && slow.top < 1, `top speed: speed 90 -> x${fast.top.toFixed(3)}, speed 20 -> x${slow.top.toFixed(3)}`);
check(fast.accel > 1 && slow.accel < 1, `acceleration: fast/light x${fast.accel.toFixed(3)}, slow/heavy x${slow.accel.toFixed(3)}`);
check(fast.turn > 1 && slow.turn < 1 && fast.edges > 1 && slow.edges < 1, 'turning and edge grip rise with agility');

// 3. legacy vs rated with neutral roster: identical events AND identical positions, every step
function run(engine, steps = 60 * 60 * 3) {
  const S = createGame('regulation', 'm2-identity', { auto: true, penalties: false, engine });
  const trace = [];
  for (let i = 0; i < steps && S.phase !== 'final'; i++) {
    step(S, {});
    if (i % 30 === 0) trace.push(S.skaters.map((p) => [p.x, p.z, p.yaw].map((v) => +v.toFixed(9)).join(',')).join(';'));
  }
  return { log: JSON.stringify(S.log), trace: trace.join('|'), score: S.score.join('-') };
}
const legacy = run({ skating: 'legacy', roster: 'neutral' }), rated = run({ skating: 'rated', roster: 'neutral' });
check(legacy.log === rated.log && legacy.trace === rated.trace, `neutral roster, rated == legacy: identical events and positions (score ${legacy.score})`);

// 4. spread roster with rated skating changes play (it is live, not a no-op)
const spread = run({ skating: 'rated', roster: 'spread' });
check(spread.trace !== legacy.trace, `spread roster with rated skating changes positions (score ${spread.score})`);

console.log(fail ? `${fail} skating check(s) failed` : 'all skating checks pass');
process.exitCode = fail ? 1 : 0;
