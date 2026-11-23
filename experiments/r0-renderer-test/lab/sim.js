// Shared hockey controller and match sim. One state, three renderers.
// Metres and seconds; x along the rink (blue attacks +x), z across, y up.
// Fixed 1/60 s step, all randomness from Gridiron's seeded rng (engine/rng.js).
import { rng } from './rng.js';
import { HOCKEY, poseAt } from './hockey-adapter.js';

export const RINK = { hx: 15, hz: 7.5, corner: 3.5, goalX: 12.6, mouth: 0.9 };
const MAX = 7.6, ACC = 7.5, GLIDE = 0.5, BRAKE = 14, TURN = 6.5;
const SHOT = 23, PICK = 0.85;

export function createMatch(seed = 'rink-95') {
  const R = rng(seed);
  const S = { R, t: 0, score: [0, 0], skaters: [], puck: { x: 0, z: 0, y: 0, vx: 0, vz: 0, owner: null, lock: 0, lastShooter: null }, pause: 0, user: null, extras: 0, events: [] };
  const mk = (team, x, z, role) => S.skaters.push({ id: S.skaters.length, team, x, z, vx: 0, vz: 0, yaw: team ? Math.PI : 0, role, act: 'hGlide', ph: R(), one: null, down: 0, cool: 0, number: [9, 17, 44, 30, 12, 88, 21, 7][S.skaters.length % 8], skin: R() });
  mk(0, -2, 0, 'F'); mk(0, -6, -3, 'F'); mk(0, -7, 3, 'D'); mk(0, -11.6, 0, 'G');
  mk(1, 2, 0, 'F'); mk(1, 6, 3, 'F'); mk(1, 7, -3, 'D'); mk(1, 11.6, 0, 'G');
  S.user = S.skaters[0];
  faceoff(S);
  return S;
}

export function setExtras(S, n) {
  // crowd test: extra skaters looping laps, not part of the match
  S.skaters = S.skaters.filter((p) => p.role !== 'X');
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    S.skaters.push({ id: 100 + i, team: i % 2, x: Math.cos(a) * 9, z: Math.sin(a) * 4.5, vx: 0, vz: 0, yaw: 0, role: 'X', act: 'hSkate', ph: S.R(), one: null, down: 0, cool: 0, number: 10 + i, skin: S.R(), lap: a });
  }
}

function faceoff(S) {
  const pos = [[-2, 0], [-6, -3], [-7, 3], [-11.6, 0], [2, 0], [6, 3], [7, -3], [11.6, 0]];
  S.skaters.filter((p) => p.role !== 'X').forEach((p, i) => { p.x = pos[i][0]; p.z = pos[i][1]; p.vx = p.vz = 0; p.one = null; p.down = 0; p.yaw = p.team ? Math.PI : 0; });
  Object.assign(S.puck, { x: 0, z: 0, y: 0, vx: 0, vz: 0, owner: null, lock: 0.6 });
  S.pause = 0.8;
}

export function bladeWorld(p) {
  const name = p.one ? p.one.name : p.act;
  const tt = p.one ? p.one.t : p.ph * HOCKEY[name].dur;
  const { stick, g } = poseAt(name, tt);
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const b = stick.H, e = stick.E;
  const m = [(b[0] + e[0]) / 2, (b[1] + e[1]) / 2 - g, (b[2] + e[2]) / 2];
  return { x: p.x + m[0] * c - m[2] * s, y: m[1], z: p.z + m[0] * s + m[2] * c };
}

const start = (p, name) => { p.one = { name, t: 0, fired: false }; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function ai(S, p) {
  const pk = S.puck, own = pk.owner, goalX = p.team ? -RINK.goalX : RINK.goalX, myGoal = -goalX;
  const want = { x: 0, z: 0, shoot: false, check: false, brake: false };
  if (p.role === 'G') {
    const tz = Math.max(-RINK.mouth, Math.min(RINK.mouth, pk.z * 0.6));
    want.x = (myGoal * 0.93 - p.x) * 2; want.z = (tz - p.z) * 3; return want;
  }
  if (own === p) {
    const tz = Math.sin(S.t * 0.9 + p.id) * 2.2;
    want.x = goalX - p.x; want.z = tz - p.z;
    const d = Math.hypot(goalX - p.x, p.z);
    if (d < 9.5 && Math.abs(p.z) < 5 && p.cool <= 0 && S.R() < 0.035) want.shoot = true;
    return want;
  }
  const mates = S.skaters.filter((q) => q.team === p.team && q.role !== 'G' && q.role !== 'X');
  const chaser = mates.reduce((a, b) => (dist(b, pk) < dist(a, pk) ? b : a));
  if (own && own.team === p.team) {
    // support: lane ahead of the carrier, spread across the ice
    const side = p.role === 'D' ? -1 : 1;
    want.x = own.x + (p.team ? -4 : 4) * (p.role === 'D' ? -0.6 : 1) - p.x;
    want.z = side * 3.2 - p.z;
  } else if (p === chaser) {
    want.x = pk.x - p.x; want.z = pk.z - p.z;
    if (own && own.team !== p.team && dist(p, own) < 1.6 && p.cool <= 0) want.check = true;
  } else {
    // cover the front of my net, between puck and goal
    want.x = (myGoal * 0.6 + pk.x * 0.4) - p.x; want.z = pk.z * 0.4 - p.z;
  }
  if (Math.hypot(p.vx, p.vz) > 5 && Math.hypot(want.x, want.z) < 1.2) want.brake = true;
  return want;
}

export function step(S, dt, input) {
  S.t += dt;
  S.events.length = 0;
  if (S.pause > 0) { S.pause -= dt; }
  const pk = S.puck;
  for (const p of S.skaters) {
    p.cool = Math.max(0, p.cool - dt);
    let w;
    if (p.role === 'X') {
      p.lap += dt * 0.55; w = { x: Math.cos(p.lap) * 9 - p.x, z: Math.sin(p.lap) * 4.5 - p.z };
    } else if (S.pause > 0) w = { x: 0, z: 0 };
    else if (p === S.user && input.active) w = { x: input.x * 4, z: input.z * 4, shoot: input.shoot, check: input.shoot && pk.owner !== p, brake: input.brake };
    else w = ai(S, p);

    // one-shot actions own the body until they finish
    if (p.one) {
      const a = HOCKEY[p.one.name];
      p.one.t += dt;
      if (p.one.name === 'hShoot' && !p.one.fired && p.one.t >= a.dur * a.release * 0.95 && pk.owner === p) {
        p.one.fired = true;
        const gx = p.team ? -RINK.goalX : RINK.goalX, aim = (S.R() - 0.5) * 1.6;
        const dx = gx - p.x, dz = aim - p.z, dl = Math.hypot(dx, dz);
        pk.owner = null; pk.vx = dx / dl * SHOT; pk.vz = dz / dl * SHOT; pk.lock = 0.35; pk.lastShooter = p; S.events.push('shot');
      }
      if (p.one.name === 'hCheck' && !p.one.fired && p.one.t >= a.dur * a.hit) {
        p.one.fired = true;
        const tgt = S.skaters.find((q) => q.team !== p.team && q.role !== 'G' && q.role !== 'X' && !q.down && dist(p, q) < 1.35);
        if (tgt) { start(tgt, 'hFall'); tgt.down = 1; if (pk.owner === tgt) { pk.owner = null; pk.vx = p.vx * 0.9; pk.vz = p.vz * 0.9; pk.lock = 0.3; } S.events.push('hit'); }
      }
      if (p.one.t >= a.dur) { if (p.one.name === 'hFall') p.down = 0.6; p.one = null; }
    }
    if (p.down > 0 && !p.one) { p.down -= dt; if (p.down <= 0) p.down = 0; }

    const busy = (p.one && p.one.name !== 'hCheck') || p.down > 0;
    const sp = Math.hypot(p.vx, p.vz);
    if (!busy && !p.one) {
      if (w.shoot && pk.owner === p && p.cool <= 0) {
        // the puck stays where the blade left it (body-relative) through the wind-up
        const c = Math.cos(p.yaw), s = Math.sin(p.yaw), dx = pk.x - p.x, dz = pk.z - p.z;
        p.hold = { f: dx * c + dz * s, r: -dx * s + dz * c };
        start(p, 'hShoot'); p.cool = 1;
      }
      else if (w.check && p.cool <= 0) { start(p, 'hCheck'); p.cool = 1.2; }
      else if (w.brake && sp > 4) start(p, 'hBrake');
    }
    // locomotion
    let ax = 0, az = 0;
    const wl = Math.hypot(w.x, w.z);
    const braking = p.one && p.one.name === 'hBrake';
    if (braking || p.down > 0 || (p.one && p.one.name === 'hFall')) {
      const dec = braking ? BRAKE : 6;
      if (sp > 0) { const k = Math.max(0, sp - dec * dt) / sp; p.vx *= k; p.vz *= k; }
    } else if (wl > 0.1 && !(p.one && p.one.name === 'hShoot')) {
      const top = p.role === 'G' ? 3 : MAX * (pk.owner === p ? 0.9 : 1) * Math.min(1, wl / 2.5 + 0.35);
      const tx = w.x / wl * top, tz = w.z / wl * top;
      const dx = tx - p.vx, dz = tz - p.vz, dl = Math.hypot(dx, dz), a = ACC * dt;
      if (dl > a) { ax = dx / dl * a; az = dz / dl * a; } else { ax = dx; az = dz; }
      p.vx += ax; p.vz += az;
    } else if (sp > 0) { const k = Math.max(0, sp - GLIDE * dt) / sp; p.vx *= k; p.vz *= k; }
    p.x += p.vx * dt; p.z += p.vz * dt;
    boards(p, 0.4, 0);
    // facing follows velocity, turn rate drops with speed
    const sp2 = Math.hypot(p.vx, p.vz);
    if (sp2 > 0.7 && !(p.one && p.one.name === 'hBrake')) {
      const target = Math.atan2(p.vz, p.vx);
      const d = ((target - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const rate = TURN / (1 + sp2 * 0.12);
      p.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    } else if (p.role === 'G') p.yaw = p.team ? Math.PI : 0;
    // gait: pushing strides while accelerating, glide otherwise
    const accel = Math.hypot(ax, az) / dt;
    const skating = accel > 1.2 || (sp2 > 2 && wl > 0.6 && p.role !== 'G');
    const next = skating ? 'hSkate' : 'hGlide';
    if (next !== p.act) { p.act = next; }
    p.ph += dt / HOCKEY[p.act].dur * (p.act === 'hSkate' ? Math.max(0.7, Math.min(1.3, sp2 / 6)) : 1);
    p.ph %= 1;
  }
  // bodies don't overlap: push pairs apart and trade a little momentum
  const sk = S.skaters;
  for (let i = 0; i < sk.length; i++) for (let j = i + 1; j < sk.length; j++) {
    const a = sk[i], b = sk[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = 0.78;
    if (d >= min || d < 1e-6) continue;
    const nx = dx / d, nz = dz / d, push = (min - d) / 2;
    a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0) { const k = rv * 0.5; a.vx += k * nx; a.vz += k * nz; b.vx -= k * nx; b.vz -= k * nz; }
  }
  // puck
  pk.lock = Math.max(0, pk.lock - dt);
  if (pk.owner) {
    const o = pk.owner;
    if (o.one && o.one.name === 'hShoot' && o.hold) {
      const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
      pk.x = o.x + o.hold.f * c - o.hold.r * s; pk.z = o.z + o.hold.f * s + o.hold.r * c;
    } else { const b = bladeWorld(o); pk.x = b.x; pk.z = b.z; }
    pk.y = 0; pk.vx = o.vx; pk.vz = o.vz;
  } else {
    pk.x += pk.vx * dt; pk.z += pk.vz * dt;
    const k = Math.exp(-0.35 * dt); pk.vx *= k; pk.vz *= k;
    boards(pk, 0.04, 0.55);
    // goal line
    for (const side of [1, -1]) {
      const gx = side * RINK.goalX;
      if ((pk.x - gx) * side > 0 && (pk.x - pk.vx * dt - gx) * side <= 0 && Math.abs(pk.z) < RINK.mouth) {
        const goalie = S.skaters.find((q) => q.role === 'G' && Math.sign(q.x) === side);
        if (goalie && Math.abs(goalie.z - pk.z) < 0.55) { pk.vx = -pk.vx * 0.35; pk.vz += (S.R() - 0.5) * 6; pk.x = gx - side * 0.05; pk.lock = 0.25; S.events.push('save'); }
        else { S.score[side > 0 ? 0 : 1]++; S.events.push('goal'); faceoff(S); return; }
      }
    }
    if (pk.lock <= 0 && Math.hypot(pk.vx, pk.vz) < 16) {
      let best = null, bd = PICK;
      for (const p of S.skaters) {
        if (p.role === 'X' || p.down > 0 || (p.one && p.one.name !== 'hCheck')) continue;
        const b = bladeWorld(p), d = Math.hypot(b.x - pk.x, b.z - pk.z);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) { pk.owner = best; S.events.push('pickup'); }
    }
  }
  // the user follows the puck on the blue team
  if (!input.active || !S.user || S.user.role === 'G') {
    const blues = S.skaters.filter((q) => q.team === 0 && q.role !== 'G' && q.role !== 'X');
    S.user = pk.owner && pk.owner.team === 0 ? pk.owner : blues.reduce((a, b) => (dist(b, pk) < dist(a, pk) ? b : a));
  }
}

function boards(o, r, e) {
  const { hx, hz, corner } = RINK;
  if (Math.abs(o.x) > hx - r) { o.x = Math.sign(o.x) * (hx - r); o.vx = -o.vx * e; }
  if (Math.abs(o.z) > hz - r) { o.z = Math.sign(o.z) * (hz - r); o.vz = -o.vz * e; }
  // rounded corners
  const cx = hx - corner, cz = hz - corner;
  if (Math.abs(o.x) > cx && Math.abs(o.z) > cz) {
    const ox = Math.sign(o.x) * cx, oz = Math.sign(o.z) * cz, dx = o.x - ox, dz = o.z - oz, d = Math.hypot(dx, dz);
    if (d > corner - r) {
      const nx = dx / d, nz = dz / d; o.x = ox + nx * (corner - r); o.z = oz + nz * (corner - r);
      const vn = o.vx * nx + o.vz * nz; if (vn > 0) { o.vx -= (1 + e) * vn * nx; o.vz -= (1 + e) * vn * nz; }
    }
  }
}

/** What each renderer needs per skater: action name and time into it. */
export function animOf(p) {
  if (p.one) return { name: p.one.name, t: p.one.t };
  return { name: p.act, t: p.ph * HOCKEY[p.act].dur };
}
