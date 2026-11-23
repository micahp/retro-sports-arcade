import { HOCKEY, poseAt } from './site/lab/hockey-adapter.js';
import { voxelize, PAL } from './site/web/stack/body.js';
for (const [name, a] of Object.entries(HOCKEY)) {
  const row = [];
  for (let i = 0; i < a.frames; i++) {
    const t = a.loop ? i / a.frames : i / (a.frames - 1);
    const v = voxelize(a.fn(t), 0.03);
    let belt = 0, sole = 0; for (let k = 0; k < v.data.length; k += 2) { const m = v.data[k] & 31; if (m === PAL.BELT) belt++; if (m === PAL.SOLE) sole++; }
    row.push(belt);
  }
  console.log(name.padEnd(7), row.join(' '));
}
