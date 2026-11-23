// Each player control does what its button says, through the same input object the page sends.
import { createGame, step, DT } from '../src/sim.js';
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++; };
// give the user the puck on open ice, well away from any opponent's stick
const give = (S) => { const u = S.user; Object.assign(u, { x: 12, z: -9, vx: 0, vz: 0, yaw: 0 }); Object.assign(S.puck, { owner: u, x: u.x + 0.9, z: u.z, vx: 0, vz: 0, settle: 0 }); };
const live = () => { const S = createGame('regulation', 'controls', { auto: false }); for (let i = 0; i < 70; i++) step(S, {}); return S; };   // past the faceoff
const run = (S, n, inp) => { for (let i = 0; i < n; i++) step(S, typeof inp === 'function' ? inp(i) : inp); };
const base = { active: true, x: 0, z: 0 };

{ // tap SHOOT with the puck: a wrist shot
  const S = live(); give(S);
  run(S, 1, { ...base, shootDown: true }); run(S, 1, { ...base, shootUp: true, held: 0.05 }); run(S, 60, base);
  const sh = S.log.find((e) => e.type === 'shot' && e.team === 0);
  check(sh && sh.kind === 'wrist', `tap SHOOT: ${sh ? sh.kind + ' shot at ' + sh.speed + ' m/s' : 'no shot'}`);
}
{ // hold SHOOT: a slap shot, harder
  const S = live(); give(S);
  run(S, 1, { ...base, shootDown: true }); run(S, 1, { ...base, shootUp: true, held: 0.6 }); run(S, 80, base);
  const sh = S.log.find((e) => e.type === 'shot' && e.team === 0);
  check(sh && sh.kind === 'slap' && sh.speed > 30, `hold SHOOT: ${sh ? sh.kind + ' shot at ' + sh.speed + ' m/s' : 'no shot'}`);
}
{ // PASS with the puck: a pass goes out and control follows it
  const S = live(); give(S); const before = S.user;
  run(S, 1, { ...base, pass: true }); run(S, 40, base);
  const ps = S.log.find((e) => e.type === 'pass' && e.team === 0);
  check(ps && S.user !== before, `PASS: ${ps ? `pass from #${ps.from} to #${ps.to}, control moved to #${S.user.id}` : 'no pass'}`);
}
{ // SWITCH without the puck: control jumps to the teammate nearest the puck
  const S = live(); const other = S.skaters.find((p) => p.team === 1 && p.role === 'C');
  Object.assign(S.puck, { owner: other, x: other.x, z: other.z }); S.user = S.skaters.find((p) => p.team === 0 && p.role === 'LD');
  run(S, 1, { ...base, pass: true });
  const mates = S.skaters.filter((p) => p.team === 0 && !p.isG), near = mates.reduce((a, b) => (Math.hypot(b.x - S.puck.x, b.z - S.puck.z) < Math.hypot(a.x - S.puck.x, a.z - S.puck.z) ? b : a));
  check(S.user === near, `SWITCH: control on #${S.user.id} (${S.user.role}), nearest to the puck is #${near.id}`);
}
{ // stick up skates up the ice; reversing it hard at speed is a hockey stop
  const S = live(); const u = S.user, x0 = u.x, d = Math.sign(u.yaw === Math.PI ? -1 : 1);
  run(S, 90, { ...base, x: 1, z: 0 });
  const fast = Math.hypot(u.vx, u.vz), moved = u.x - x0;
  run(S, 3, { ...base, x: -1, z: 0 });
  const stopped = u.one && u.one.name === 'hBrake';
  run(S, 30, { ...base, x: -1, z: 0 });
  check(moved > 4 && fast > 5.5, `stick up: skated ${moved.toFixed(1)} m, ${fast.toFixed(1)} m/s after 1.5 s`);
  check(stopped, `reverse the stick at speed: ${stopped ? 'hockey stop' : 'no stop'} (now ${Math.hypot(u.vx, u.vz).toFixed(1)} m/s)`);
}
console.log(fail ? `${fail} control check(s) failed` : 'all control checks pass');
process.exitCode = fail ? 1 : 0;
