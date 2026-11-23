import { HOCKEY, poseAt } from './site/lab/hockey-adapter.js';
for (const [name, a] of Object.entries(HOCKEY)) {
  const out = [];
  for (let i = 0; i <= 6; i++) {
    const { J, stick, g } = poseAt(name, (i / 6) * a.dur * 0.999);
    const L = Math.hypot(stick.H[0] - stick.T[0], stick.H[1] - stick.T[1], stick.H[2] - stick.T[2]);
    out.push(`${L.toFixed(2)}@${(stick.H[1] - g).toFixed(2)}`);
  }
  console.log(name.padEnd(7), 'shaftLen@bladeHeightAboveSkates:', out.join(' '), ' pelvisPitch?', '');
}
