// Team AI: formation-aware positioning by role, plus carrier and defender decisions.
// Works in each team's attack frame: ax grows toward the net it attacks, and az is
// mirrored with it so LW is always on the left (negative az) whichever way it attacks.
import { RINK, SKATE } from './config.js';
import { attackDir, choosePassTarget, laneOpen } from './helpers.js';

const LANE = { LW: -7, C: 0, RW: 7, LD: -4.5, RD: 4.5, X: 2 };
const isD = (r) => r === 'LD' || r === 'RD';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function aiIntent(S, p) {
  if (p.isG) return { mx: 0, mz: 0 };
  const d = attackDir(S, p.team), pk = S.puck, own = pk.owner;
  const toA = (x, z) => ({ ax: x * d, az: z * d }), toW = (ax, az) => ({ x: ax * d, z: az * d });
  const P = toA(pk.x, pk.z), me = toA(p.x, p.z);
  const G = RINK.goalX, B = RINK.blueX;
  const team = S.skaters.filter((q) => q.team === p.team && !q.isG && !q.benched);
  const opps = S.skaters.filter((q) => q.team !== p.team && !q.isG && !q.benched);
  const it = { mx: 0, mz: 0 };
  const go = (ax, az, urgency = 1) => {
    const w = toW(ax, az), dx = w.x - p.x, dz = w.z - p.z, l = Math.hypot(dx, dz);
    const s = l < 0.4 ? 0 : Math.min(1, l / 3.5) * urgency;
    // spread out: push away from teammates who are too close
    let rx = 0, rz = 0;
    for (const q of team) { if (q === p) continue; const ex = p.x - q.x, ez = p.z - q.z, e = Math.hypot(ex, ez); if (e < 4 && e > 0.01) { rx += ex / e * (4 - e) * 0.25; rz += ez / e * (4 - e) * 0.25; } }
    it.mx = (l > 1e-3 ? dx / l * s : 0) + rx; it.mz = (l > 1e-3 ? dz / l * s : 0) + rz;
    const m = Math.hypot(it.mx, it.mz); if (m > 1) { it.mx /= m; it.mz /= m; }
  };

  // ---------------- carrying the puck
  if (own === p) {
    const goal = toW(G, 0), gd = Math.hypot(goal.x - p.x, goal.z - p.z);
    const ang = Math.abs(Math.atan2(me.az, G - me.ax));
    // pressure: nearest opponent in front
    let press = 99;
    for (const o of opps) { const dx = o.x - p.x, dz = o.z - p.z, e = Math.hypot(dx, dz); if ((dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw)) > -0.5) press = Math.min(press, e); }
    // drive to the net along a lane, dodging the nearest defender
    const laneZ = clamp(me.az * 0.85, -6, 6) + Math.sin(S.t * 0.7 + p.id) * 1.5;
    go(Math.min(G - 2.5, me.ax + 8), me.ax > G - 12 ? me.az * 0.5 : laneZ, 1);
    for (const o of opps) {
      const ex = p.x - o.x, ez = p.z - o.z, e = Math.hypot(ex, ez);
      if (e < 3.2) { it.mx += ex / e * (3.2 - e) * 0.35; it.mz += ez / e * (3.2 - e) * 0.35; }
    }
    const rate = S.t - (p.lastThink || 0);
    if (rate > 0.15) {
      p.lastThink = S.t;
      if (me.ax > G - 16 && me.ax < G + 0.5 && ang < 1.0) {
        const close = gd < 8, room = press > 3.5;
        if ((close && S.R() < 0.45) || (!close && room && gd < 17 && S.R() < 0.12)) { it.shoot = !close && room && S.R() < 0.5 ? 'slap' : 'wrist'; return it; }
      }
      if (press < 2.6 || S.R() < 0.06) {
        const q = choosePassTarget(S, p);
        if (q && laneOpen(S, p, q) > 0.55 && (S.R() < 0.7 || press < 1.8)) { it.pass = q; return it; }
      }
    }
    return it;
  }

  // ---------------- everyone else
  const mineHasIt = own && own.team === p.team, theyHaveIt = own && own.team !== p.team;
  const lane = LANE[p.role] ?? 0;
  // nearest healthy teammate to the puck pressures it
  const chaser = team.filter((q) => q.down <= 0).reduce((a, b) => (dist(b, pk) < dist(a, pk) ? b : a), team[0]);
  if (!mineHasIt && p === chaser) {
    // aim a little ahead of a moving carrier
    const lead = theyHaveIt ? 0.35 : 0.15, tx = pk.x + pk.vx * lead, tz = pk.z + pk.vz * lead;
    const a = toA(tx, tz); go(a.ax, a.az, 1);
    if (theyHaveIt) {
      const e = dist(p, own), closing = ((p.vx - own.vx) * (own.x - p.x) + (p.vz - own.vz) * (own.z - p.z)) / (e || 1);
      if (e < SKATE.checkReach + 0.2 && closing > SKATE.checkMinSpeed && p.cool <= 0 && S.R() < 0.12) it.check = true;
      else if (e < SKATE.pokeReach && p.cool <= 0 && S.R() < 0.05) it.check = true;
    }
    return it;
  }
  // special teams: how many skaters each side has on the ice right now
  const mine = team.length, theirs = opps.length;
  const slots = (list) => { const order = team.slice().sort((a, b) => (isD(b.role) - isD(a.role)) || a.id - b.id); const k = order.indexOf(p); return list[Math.min(k, list.length - 1)]; };
  if (mineHasIt && mine > theirs && P.ax > B) {
    // power play in the zone: two points, two half-walls, one at the net front
    const [ax, az] = slots([[B + 1.5, -6], [B + 1.5, 6], [G - 9, -7.5], [G - 9, 7.5], [G - 2.2, 0], [G - 5, 0]]);
    go(ax, az); return it;
  }
  if (!mineHasIt && mine < theirs && P.ax < -B) {
    // penalty kill in our end: a tight box (a triangle at 5 on 3) between the puck and the net
    const box = mine >= 4 ? [[-G + 3.5, -2.6], [-G + 3.5, 2.6], [-G + 8.5, -3.3], [-G + 8.5, 3.3]] : [[-G + 3, 0], [-G + 7.5, -3], [-G + 7.5, 3]];
    const [ax, az] = slots(box);
    go(ax, clamp(az + P.az * 0.25, -8, 8)); return it;
  }
  if (mineHasIt) {
    const ozone = P.ax > B;
    if (isD(p.role)) {
      if (ozone) go(B + 1.5, lane * 1.35);                         // hold the points
      else go(clamp(P.ax - 9, -G + 3, B - 1), lane);
    } else if (ozone) {
      if (p.role === 'C') go(G - 7.5, -P.az * 0.4);                // high slot
      else go(G - 4.5, lane * 0.75);                               // wingers crash the posts
    } else go(clamp(P.ax + 5, -G + 4, G - 6), lane);                // break ahead in your lane
    return it;
  }
  // defending (or loose puck, not the chaser): protect the net, mark the slot
  const net = { ax: -G, az: 0 };
  const dzone = P.ax < -B;
  if (isD(p.role)) {
    const k = dzone ? 0.35 : 0.45;
    go(clamp(net.ax + (P.ax - net.ax) * k, -G + 1.5, P.ax - 2), clamp(P.az * 0.5 + lane * 0.55, -8, 8));
  } else if (p.role === 'C') {
    go(clamp((P.ax + net.ax) / 2, -G + 4, P.ax - 1), P.az * 0.35);
  } else {
    // wingers cover their side's point in their own zone, otherwise backcheck in lane
    if (dzone) go(-B - 1.5, lane * 1.1);
    else go(clamp(P.ax - 4, -G + 6, G - 6), lane);
  }
  return it;
}
