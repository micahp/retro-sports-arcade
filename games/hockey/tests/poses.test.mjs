// Every hockey action bakes inside the sprite footprint; the stick (drawn separately from the physics
// geometry) keeps its shaft length and puts the blade on the ice when the pose says so; the drawn stick
// and the physics contact point are the same geometry.
import { HOCKEY, poseAt } from '../src/poses.js';
import { voxelize, BAKE } from '../vendor/stack/body.js';
import { bladeOf, stickWorld } from '../src/sim.js';
let fail = 0;
const bad = (...m) => { console.log('FAIL', ...m); fail++; };
for (const [name, a] of Object.entries(HOCKEY)) {
  for (let i = 0; i < a.frames; i++) {
    const t = a.loop ? i / a.frames : i / (a.frames - 1);
    // the body must not touch the edge of the bake footprint (it would be cut off)
    const v = voxelize(a.fn(t), 0.035);
    if (v.i0 === 0 || v.j0 === 0 || v.i0 + v.gx >= v.G || v.j0 + v.gz >= v.G) bad(name, i, `body touches the ${BAKE.half} m bake footprint edge`);
    const { stick: s } = poseAt(name, t * a.dur);
    const L = Math.hypot(s.H[0] - s.T[0], s.H[1] - s.T[1], s.H[2] - s.T[2]);
    if (!(L > 0.6 && L < 1.7)) bad(name, i, 'shaft length', L.toFixed(2));
    // drawn stick == physics: at several facings, the drawn contact point is exactly bladeOf
    for (const yaw of [0, 0.7, 2.4, -1.9]) {
      const p = { x: 3, z: -2, yaw, act: a.loop ? name : 'hGlide', ph: a.loop ? t : 0, one: a.loop ? null : { name, t: t * a.dur } };
      const w = stickWorld(p), b = bladeOf(p);
      if (Math.hypot(w.C.x - b.x, w.C.y - b.y, w.C.z - b.z) > 1e-9) bad(name, i, 'drawn contact point differs from the physics contact point');
    }
  }
}
// blade on the ice: every pose whose stick target is on the ice has the drawn blade at ice level
for (const name of ['hGlide', 'hSkate']) {
  const p = { x: 0, z: 0, yaw: 0, act: name, ph: 0.3, one: null }, w = stickWorld(p);
  if (!(Math.abs(w.H.y - 0.03) < 0.02 && w.E.y < 0.06)) bad(name, 'blade not on the ice: heel', w.H.y.toFixed(3), 'toe', w.E.y.toFixed(3));
}
console.log(fail ? `${fail} pose failures` : `poses ok: ${Object.keys(HOCKEY).length} actions, footprint ${BAKE.half} m, drawn stick = physics stick`);
process.exitCode = fail ? 1 : 0;
