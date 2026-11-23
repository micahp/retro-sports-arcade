// Puck physics. Pure functions over plain objects so the node tests and the game
// run the same code. x along the rink, z across, y up (metres).
import { RINK, PUCK } from './config.js';

export function makePuck() {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: null, settle: 0, lock: 0, lastTouch: null, shot: null, inNet: 0, trail: [] };
}

/** Keep a circle of radius r inside the rounded-rectangle boards. Returns the wall normal hit, or null. */
export function boards(o, r, rest, tan) {
  const { hx, hz, corner } = RINK;
  let n = null;
  const cx = hx - corner, cz = hz - corner;
  if (Math.abs(o.x) > cx && Math.abs(o.z) > cz) {
    const ox = Math.sign(o.x) * cx, oz = Math.sign(o.z) * cz, dx = o.x - ox, dz = o.z - oz, d = Math.hypot(dx, dz);
    if (d > corner - r) { n = [-dx / d, -dz / d]; o.x = ox - n[0] * (corner - r); o.z = oz - n[1] * (corner - r); }
  } else if (Math.abs(o.x) > hx - r) { n = [-Math.sign(o.x), 0]; o.x = Math.sign(o.x) * (hx - r); }
  else if (Math.abs(o.z) > hz - r) { n = [0, -Math.sign(o.z)]; o.z = Math.sign(o.z) * (hz - r); }
  if (n) {
    const sp = Math.hypot(o.vx, o.vz), vn = -(o.vx * n[0] + o.vz * n[1]);
    const glancing = sp > 0 ? Math.min(1, vn / (sp * 0.5)) : 1;   // 0 = skimming along, 1 = straight in
    // friction scales with how hard it hits: a puck skimming the boards keeps its speed
    reflect(o, n, rest * (0.25 + 0.75 * glancing), 1 - (1 - tan) * glancing);
  }
  return n;
}

/** Reflect velocity off a surface with inward normal n: restitution on the normal part, friction on the tangent part. */
export function reflect(o, n, rest, tan, vSurf = [0, 0]) {
  const rvx = o.vx - vSurf[0], rvz = o.vz - vSurf[1];
  const vn = rvx * n[0] + rvz * n[1];
  if (vn >= 0) return false;                  // already moving away
  const tx = rvx - vn * n[0], tz = rvz - vn * n[1];
  o.vx = vSurf[0] + tx * tan - vn * rest * n[0];
  o.vz = vSurf[1] + tz * tan - vn * rest * n[1];
  return true;
}

/**
 * Advance a loose puck by dt. bodies: [{x, z, vx, vz, r}] it can bounce off.
 * Returns events: 'board', 'post', 'net', 'goal:+1' / 'goal:-1' (which end), 'body:<i>'.
 */
export function stepPuck(p, dt, bodies = []) {
  // substep fast pucks so they can't tunnel through a 3 cm post or a skater's legs
  const n = Math.min(16, Math.max(1, Math.ceil(Math.hypot(p.vx, p.vz) * dt / 0.05)));
  const ev = [];
  for (let i = 0; i < n; i++) { const e = subStep(p, dt / n, bodies); ev.push(...e); if (e.some((x) => x.startsWith('goal'))) break; }
  return [...new Set(ev)];
}
function subStep(p, dt, bodies) {
  const ev = [];
  if (p.inNet > 0) { p.inNet -= dt; p.vx *= 0.8; p.vz *= 0.8; return ev; }
  const px = p.x, pz = p.z;
  // ice friction only while the puck is on the ice
  const sp = Math.hypot(p.vx, p.vz);
  if (sp > 0) {
    const dec = (p.y <= 0.001 ? PUCK.iceDecel : 0) * dt + PUCK.drag * sp * dt;
    const k = Math.max(0, sp - dec) / sp; p.vx *= k; p.vz *= k;
  }
  // height: gravity and a dead bounce on the ice
  if (p.y > 0 || p.vy > 0) {
    p.vy -= PUCK.gravity * dt; p.y += p.vy * dt;
    if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) > 1.2 ? -p.vy * 0.25 : 0; }
  }
  p.x += p.vx * dt; p.z += p.vz * dt;

  // goal mouths, posts and nets at both ends
  for (const side of [1, -1]) {
    const gx = side * RINK.goalX, back = gx + side * RINK.netDepth;
    const crossed = (px - gx) * side <= 0 && (p.x - gx) * side > 0;
    if (crossed && Math.abs(p.z) < RINK.mouth - PUCK.radius) {
      if (p.y < RINK.crossbar) { ev.push(`goal:${side}`); p.inNet = 1.2; p.x = gx + side * 0.4; p.vx *= 0.2; p.vz *= 0.2; p.vy = 0; p.y = 0; return ev; }
      ev.push('crossbar'); p.vx = -p.vx * 0.4; p.x = gx - side * 0.02;
    }
    // posts: two small circles at the corners of the mouth
    for (const pzp of [RINK.mouth, -RINK.mouth]) {
      const dx = p.x - gx, dz = p.z - pzp, d = Math.hypot(dx, dz), min = PUCK.postR + PUCK.radius;
      if (d < min && p.y < RINK.crossbar) {
        const n = [dx / d, dz / d]; p.x = gx + n[0] * min; p.z = pzp + n[1] * min;
        if (reflect(p, n, PUCK.postRest, 0.9)) ev.push('post');
      }
    }
    // net box from outside (sides and back): treat as walls
    const inX = (p.x - gx) * side > 0 && (p.x - back) * side < 0;
    if (inX && Math.abs(p.z) < RINK.mouth + PUCK.radius && !crossed) {
      const fromBack = (px - back) * side >= 0, fromSide = Math.abs(pz) >= RINK.mouth;
      if (fromBack) { p.x = back + side * PUCK.radius; reflect(p, [side, 0], 0.3, 0.7); ev.push('net'); }
      else if (fromSide) { p.z = Math.sign(pz) * (RINK.mouth + PUCK.radius); reflect(p, [0, Math.sign(pz)], 0.3, 0.7); ev.push('net'); }
    }
  }
  // bodies (skates, shins): a loose fast puck deflects off them
  bodies.forEach((b, i) => {
    if (p.y > 1.5) return;
    const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz), min = (b.r || PUCK.bodyR) + PUCK.radius;
    if (d < min && d > 1e-6) {
      const n = [dx / d, dz / d]; p.x = b.x + n[0] * min; p.z = b.z + n[1] * min;
      const vn = (p.vx - (b.vx || 0)) * n[0] + (p.vz - (b.vz || 0)) * n[1];
      // a real deflection only when the puck actually hits the body; a resting puck is just nudged aside
      if (reflect(p, n, PUCK.bodyRest, 0.6, [b.vx || 0, b.vz || 0]) && vn < -2) ev.push(`body:${i}`);
    }
  });
  if (boards(p, PUCK.radius, PUCK.boardRest, PUCK.boardTan)) ev.push('board');
  return ev;
}

/** Lead pass: puck speed and direction so it meets a receiver moving at constant velocity. */
export function leadPass(from, to, speed) {
  const rx = to.x - from.x, rz = to.z - from.z, vx = to.vx || 0, vz = to.vz || 0;
  // |r + v t| = s t  ->  (v.v - s^2) t^2 + 2 r.v t + r.r = 0
  const a = vx * vx + vz * vz - speed * speed, b = 2 * (rx * vx + rz * vz), c = rx * rx + rz * rz;
  let t;
  if (Math.abs(a) < 1e-6) t = -c / b;
  else { const disc = b * b - 4 * a * c; if (disc < 0) return null; const t1 = (-b - Math.sqrt(disc)) / (2 * a), t2 = (-b + Math.sqrt(disc)) / (2 * a); t = Math.min(...[t1, t2].filter((x) => x > 0)); }
  if (!(t > 0) || t > 3) return null;
  const tx = rx + vx * t, tz = rz + vz * t, l = Math.hypot(tx, tz);
  return { vx: tx / l * speed, vz: tz / l * speed, t, at: { x: from.x + tx, z: from.z + tz } };
}
