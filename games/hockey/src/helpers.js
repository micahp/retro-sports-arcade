// Small rule helpers shared by the sim and the AI.
export const attackDir = (S, team) => ((team === 0) === (S.period % 2 === 1) ? 1 : -1);

export function choosePassTarget(S, p, ax = 0, az = 0) {
  const mates = S.skaters.filter((q) => q.team === p.team && q !== p && !q.isG && q.down <= 0);
  const al = Math.hypot(ax, az);
  let best = null, bs = -1e9;
  for (const q of mates) {
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    if (d < 2.5 || d > 32) continue;
    let s = -d * 0.08 + laneOpen(S, p, q) * 2 + (q.x - p.x) * attackDir(S, p.team) * 0.06;
    if (al > 0.3) s += ((dx * ax + dz * az) / (d * al)) * 4;
    if (s > bs) { bs = s; best = q; }
  }
  return best;
}
/** 0..1: how clear the straight line from a to b is of opponents' sticks. */
export function laneOpen(S, a, b) {
  let m = 3;
  for (const o of S.skaters) {
    if (o.team === a.team || o.down > 0) continue;
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
    const u = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.z - a.z) * dz) / L2));
    m = Math.min(m, Math.hypot(a.x + dx * u - o.x, a.z + dz * u - o.z));
  }
  return Math.min(1, m / 3);
}

