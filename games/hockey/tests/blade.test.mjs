// Blade geometry (correctness). The legacy physics blade points back toward the player; the planar blade
// continues the shaft line with the toe away from the player. Checks: geometry per action, contact in front of
// the hands, and that the default engine (legacy) is unchanged.
import { poseAt, HOCKEY } from '../src/poses.js';
import { createGame, step, bladeOf } from '../src/sim.js';
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++; };
const ACTS = ['hGlide', 'hSkate', 'hPass', 'hShoot', 'hCheck', 'hBrake'];
for (const name of ACTS) {
  const { stick } = poseAt(name, HOCKEY[name].dur * 0.5);
  const fwdLegacy = stick.E0[0] - stick.H0[0];
  const fwdPlanar = stick.Ep0[0] - stick.H0[0];
  const shaftLen = Math.hypot(stick.H0[0] - stick.T[0], stick.H0[2] - stick.T[2]);
  if (name === 'hGlide' || name === 'hSkate') check(fwdLegacy < 0, `${name}: legacy toe points back toward the player (fwd ${fwdLegacy.toFixed(3)} m)`);
  check(Math.abs(Math.hypot(stick.Ep0[0] - stick.H0[0], stick.Ep0[2] - stick.H0[2]) - 0.27) < 1e-9, `${name}: planar blade is 0.27 m long`);
  check(stick.Ep0[1] - stick.H0[1] <= 0.02 || name !== 'hGlide', `${name}: planar blade stays at the heel height (${(stick.Ep0[1] - stick.H0[1]).toFixed(3)} m)`);
  if (shaftLen > 0.5) check(Math.abs((stick.Ep0[0] - stick.H0[0]) * (stick.H0[2] - stick.T[2]) - (stick.Ep0[2] - stick.H0[2]) * (stick.H0[0] - stick.T[0])) < 1e-6, `${name}: planar blade lies on the shaft line`);
}
// contact point: planar contact is ahead of the hands (away from the player); legacy is behind the heel
const S0 = createGame('regulation', 'blade-0', { auto: true, penalties: false });
const S1 = createGame('regulation', 'blade-0', { auto: true, penalties: false, engine: { blade: 'planar' } });
const p0 = S0.skaters[0], p1 = S1.skaters[0];
p0.x = p1.x = 0; p0.z = p1.z = 0; p0.yaw = p1.yaw = 0; p0.act = p1.act = 'hGlide';
const b0 = bladeOf(p0), b1 = bladeOf(p1);
check(b1.x > b0.x + 0.1, `contact point (glide, facing +x): planar ${b1.x.toFixed(3)} m, legacy ${b0.x.toFixed(3)} m: planar is further forward`);
{ // the planar contact is exactly the midpoint of the planar blade in the physics frame
  const tt = p1.ph * HOCKEY.hGlide.dur; const q = poseAt('hGlide', tt);
  const mid = [(q.stick.H0[0] + q.stick.Ep0[0]) / 2, (q.stick.H0[2] + q.stick.Ep0[2]) / 2];
  check(Math.abs(b1.x - mid[0]) < 1e-9 && Math.abs(b1.z - mid[1]) < 1e-9, 'planar contact equals the midpoint of the drawn planar blade (yaw 0)');
}
check(p0.bladeMode === 'legacy' && p1.bladeMode === 'planar', 'skater carries its blade mode from the engine option');
// default engine unchanged: same events as an explicit legacy engine
const a = createGame('regulation', 'blade-d', { auto: true, penalties: false });
const b = createGame('regulation', 'blade-d', { auto: true, penalties: false, engine: { blade: 'legacy' } });
for (let i = 0; i < 60 * 60; i++) { step(a, {}); step(b, {}); }
check(JSON.stringify(a.log) === JSON.stringify(b.log), 'default engine equals explicit legacy: identical events over 60 s');
console.log(fail ? `${fail} blade check(s) failed` : 'all blade checks pass');
process.exitCode = fail ? 1 : 0;
