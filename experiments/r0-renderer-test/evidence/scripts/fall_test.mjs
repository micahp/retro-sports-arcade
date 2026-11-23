import { HOCKEY, poseAt } from './site/lab/hockey-adapter.js';
const f = (v) => v.map((x) => x.toFixed(2)).join(',');
for (const t of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
  const { J, stick, g } = poseAt('hFall', t * HOCKEY.hFall.dur);
  console.log(t, 'pelvis', f(J.pelvis.p), 'g', g.toFixed(2), 'T', f(stick.T), 'H', f(stick.H), 'minJointY', Math.min(...Object.keys(J).filter(k=>k[0]!=='_').map(k=>J[k].p[1])).toFixed(2));
}
console.log('dur', HOCKEY.hFall.dur);
