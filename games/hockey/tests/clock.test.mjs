// Game-clock rate (engine.clockRate). Physics always steps at 60 Hz; only the game clock and the penalty time
// (which is game time) run faster. Legacy (rate 1) is unchanged.
import { createGame, step, callPenalty } from '../src/sim.js';
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++; };
const trace = (S, steps) => { const out = []; for (let i = 0; i < steps; i++) { step(S, {}); if (i % 30 === 0) out.push(S.skaters.map((p) => `${p.x.toFixed(9)},${p.z.toFixed(9)}`).join(';') + `|${S.puck.x.toFixed(9)}`); } return out.join('\n'); };

{ // 1. default rate is 1 and gives the same events as an explicit 1
  const a = createGame('regulation', 'clk', { auto: true, penalties: false });
  const b = createGame('regulation', 'clk', { auto: true, penalties: false, engine: { clockRate: 1 } });
  for (let i = 0; i < 60 * 90; i++) { step(a, {}); step(b, {}); }
  check(a.engine.clockRate === 1 && JSON.stringify(a.log) === JSON.stringify(b.log) && a.clock === b.clock, 'default clockRate is 1: identical events and clock');
}
{ // 2. physics is independent of the clock rate: identical positions while no clock event (period end) intervenes
  const a = createGame('nhl95', 'clk2', { auto: true, penalties: false });
  const b = createGame('nhl95', 'clk2', { auto: true, penalties: false, engine: { clockRate: 2.43 } });
  const ta = trace(a, 60 * 30), tb = trace(b, 60 * 30);
  check(ta === tb, 'clockRate 2.43: skater and puck positions identical to rate 1 over 30 s of physics');
  const usedA = 600 - a.clock, usedB = 600 - b.clock;
  check(Math.abs(usedB / usedA - 2.43) < 1e-6, `clockRate 2.43: the game clock ran ${(usedB / usedA).toFixed(3)}x as fast (${usedA.toFixed(1)} s vs ${usedB.toFixed(1)} s)`);
}
{ // 3. a minor counts game seconds: its timer drops by clockRate seconds per second of live physics
  const S = createGame('nhl95', 'clk3', { auto: true, penalties: true, engine: { clockRate: 2.43 } });
  while (S.phase !== 'play') step(S, {});
  callPenalty(S, S.skaters.find((q) => !q.isG), 'hooking');
  const pen = S.box[0];
  let livePhysics = 0;
  const left0 = pen.left;
  for (let i = 0; i < 60 * 60 && S.box.includes(pen) && livePhysics < 3; i++) {
    const live = S.phase === 'play';
    step(S, {});
    if (live && pen.serving && S.box.includes(pen)) livePhysics += 1 / 60;
  }
  const used = left0 - pen.left;
  check(livePhysics > 1 && Math.abs(used / livePhysics - 2.43) < 0.02, `penalty timer: ${used.toFixed(2)} game s per ${livePhysics.toFixed(2)} s of live physics (${(used / livePhysics).toFixed(3)}x)`);
}
console.log(fail ? `${fail} clock check(s) failed` : 'all clock checks pass');
process.exitCode = fail ? 1 : 0;
