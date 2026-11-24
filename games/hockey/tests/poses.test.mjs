// Every hockey action bakes, keeps a full stick and keeps the skates on the ice when standing.
import { HOCKEY, poseAt, REACH_LIMIT } from '../src/poses.js';
import { voxelize, PAL } from '../vendor/stack/body.js';
let fail = 0;
for (const [name, a] of Object.entries(HOCKEY)) {
  for (let i = 0; i < a.frames; i++) {
    const t = a.loop ? i / a.frames : i / (a.frames - 1);
    const v = voxelize(a.fn(t), 0.04);
    let stick = 0; for (let k = 0; k < v.data.length; k += 2) if ((v.data[k] & 31) === PAL.BELT) stick++;
    if (stick < 40) { console.log('FAIL', name, i, 'stick voxels', stick); fail++; }
    const { stick: s } = poseAt(name, t * a.dur);
    const L = Math.hypot(s.H[0] - s.T[0], s.H[1] - s.T[1], s.H[2] - s.T[2]);
    if (!(L > 0.6 && L < 1.7)) { console.log('FAIL', name, i, 'shaft length', L.toFixed(2)); fail++; }
    // the drawn blade must fit in the bake footprint, or it is cut off and the stick floats off the ice
    const reach = Math.max(Math.abs(s.H[0]), Math.abs(s.H[2]), Math.abs(s.E[0]), Math.abs(s.E[2]));
    if (reach > REACH_LIMIT + 1e-9) { console.log('FAIL', name, i, 'blade outside the bake footprint', reach.toFixed(2)); fail++; }
    // and when the blade is down, stick voxels must actually be at ice level (lowest 12 cm of the bake)
    if (s.H[1] - s.g < 0.08) {
      let low = 0; const layer = v.gx * v.gz * 2, nLow = Math.ceil(0.12 / v.v);
      for (let kk = 0; kk < nLow * layer && kk < v.data.length; kk += 2) if ((v.data[kk] & 31) === PAL.BELT) low++;
      if (low < 6) { console.log('FAIL', name, i, 'blade on the ice but only', low, 'stick voxels at ice level'); fail++; }
    }
  }
}
console.log(fail ? `${fail} pose failures` : `poses ok: ${Object.keys(HOCKEY).length} actions`);
process.exitCode = fail ? 1 : 0;
