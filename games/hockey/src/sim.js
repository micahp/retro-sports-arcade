// Hockey match: lineups, rules flow, possession, shots, passes, checks, goalies.
// Deterministic: fixed 1/60 s steps, all randomness from the seeded rng.
import { rng } from './rng.js';
import { RINK, PUCK, SHOT, SKATE, GOALIE, LINEUPS, MODES, PENALTY } from './config.js';
import { makePuck, stepPuck, boards, leadPass } from './puck.js';
import { HOCKEY, poseAt } from './poses.js';
import { aiIntent } from './ai.js';
import { attackDir, choosePassTarget, laneOpen } from './helpers.js';
export { attackDir, choosePassTarget, laneOpen };

export const DT = 1 / 60;
export const TEAMS = [{ name: 'Harbor', short: 'HAR' }, { name: 'Foundry', short: 'FDY' }];
const NUMS = { LW: 19, C: 9, RW: 27, LD: 4, RD: 44, X: 14, G: 31 };

export function createGame(modeKey = 'regulation', seed = 'rink-95', opts = {}) {
  const mode = MODES[modeKey];
  // opts.periodSec picks one of the mode's periodOptions (NHL 95 rules: 5, 10 or 20 minutes)
  if (opts.periodSec != null && !(mode.periodOptions || []).includes(opts.periodSec)) throw new Error(`period length ${opts.periodSec} s is not an option of ${modeKey}`);
  const periodSec = opts.periodSec ?? mode.periodSec;
  const S = {
    R: rng(seed), mode, modeKey, t: 0, period: 1, clock: periodSec || 0, periodSec, score: [0, 0],
    phase: 'faceoff', phaseT: 0, skaters: [], puck: makePuck(), user: null, userTeam: opts.userTeam ?? 0,
    log: [], events: [], stats: [0, 1].map(() => ({ shots: 0, saves: 0, goals: 0, passes: 0, passesDone: 0, intercepts: 0, hits: 0 })),
    touch: 0, faceSpot: { x: 0, z: 0 }, banner: '', debug: { trails: [], marks: [] }, shootout: null, auto: !!opts.auto,
    penaltiesOn: PENALTY.enabled && (opts.penalties ?? !!mode.penalties), box: [],
  };
  if (mode.shootout) startShootout(S); else setLineups(S, mode.skaters, mode.goalies);
  if (mode.lab) { S.phase = 'play'; } else if (!mode.shootout) faceoffAt(S, 0, 0);
  return S;
}


function makeSkater(S, team, role) {
  const isG = role === 'G';
  return { id: S.skaters.length, team, role, isG, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, act: isG ? 'gStance' : 'hGlide', ph: S.R(), one: null, down: 0, cool: 0,
    number: NUMS[role] + (team ? 1 : 0), skin: S.R(), intent: null, tried: -1, charge: 0, hold: null };
}
export function addSkater(S, team, role, at = {}) { const p = makeSkater(S, team, role); Object.assign(p, at); S.skaters.push(p); p.id = S.skaters.length - 1; return p; }
export function setLineups(S, skaters, goalies = [true, true]) {
  S.skaters = [];
  for (const team of [0, 1]) {
    for (const role of LINEUPS[skaters[team]]) S.skaters.push(makeSkater(S, team, role));
    if (goalies[team]) S.skaters.push(makeSkater(S, team, 'G'));
  }
  S.skaters.forEach((p, i) => { p.id = i; });
  S.manpower = [...skaters];
  S.user = S.skaters.find((p) => p.team === S.userTeam && p.role === 'C') || S.skaters.find((p) => p.team === S.userTeam && !p.isG);
}

// ---------------------------------------------------------------- faceoffs
function faceoffAt(S, fx, fz) {
  S.phase = 'faceoff'; S.phaseT = 0; S.faceSpot = { x: fx, z: fz };
  const pk = S.puck; Object.assign(pk, { x: fx, z: fz, y: 0, vx: 0, vz: 0, vy: 0, owner: null, settle: 0, lock: 0, shot: null, inNet: 0 });
  for (const p of S.skaters) {
    if (p.inBox || p.retired) continue;
    const d = attackDir(S, p.team);            // +1 if this team attacks +x
    const back = (dx, dz) => ({ x: fx - d * dx, z: fz + d * dz });
    let at;
    if (p.isG) at = { x: -d * (RINK.goalX - 0.6), z: 0 };
    else ({ C: () => (at = back(0.6, 0)), LW: () => (at = back(1.2, -4)), RW: () => (at = back(1.2, 4)), LD: () => (at = back(6, -3.5)), RD: () => (at = back(6, 3.5)), X: () => (at = back(3, 0)) })[p.role]();
    at.x = Math.max(-RINK.hx + 1, Math.min(RINK.hx - 1, at.x)); at.z = Math.max(-RINK.hz + 1, Math.min(RINK.hz - 1, at.z));
    Object.assign(p, at, { vx: 0, vz: 0, one: null, down: 0, cool: 0, charge: 0, yaw: d > 0 ? 0 : Math.PI });
  }
}
function dropPuck(S, input) {
  const cs = S.skaters.filter((p) => p.role === 'C' || (p.role === 'X' && !S.skaters.some((q) => q.team === p.team && q.role === 'C')));
  const [a, b] = [0, 1].map((t) => cs.find((p) => p.team === t));
  let win;
  if (input && input.faceoffTap != null && a && S.userTeam === 0) win = input.faceoffTap < 0.35 ? a : b;   // a quick tap at the drop wins it
  else win = S.R() < 0.5 ? a : b;
  win = win || a || b;
  const pk = S.puck, d = attackDir(S, win.team);
  // the winner draws it back toward a defenceman
  const ang = (S.R() - 0.5) * 1.2;
  pk.vx = -d * 7 * Math.cos(ang); pk.vz = 7 * Math.sin(ang); pk.lock = 0.15; S.touch++;
  pk.lastTouch = win; S.phase = 'play'; S.phaseT = 0;
  log(S, 'faceoff', { team: win.team });
}

function log(S, type, data = {}) { const e = { t: +S.t.toFixed(3), type, ...data }; S.log.push(e); S.events.push(e); }

// ---------------------------------------------------------------- stick / blade
export function bladeOf(p) {
  const name = p.one ? p.one.name : p.act, a = HOCKEY[name];
  const tt = p.one ? p.one.t : p.ph * a.dur;
  const { stick, g } = poseAt(name, tt);
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const m = [(stick.H[0] + stick.E[0]) / 2, (stick.H[1] + stick.E[1]) / 2 - g, (stick.H[2] + stick.E[2]) / 2];
  return { x: p.x + m[0] * c - m[2] * s, y: m[1], z: p.z + m[0] * s + m[2] * c };
}
const start = (p, name) => { p.one = { name, t: 0, fired: false }; };
const busy = (p) => p.down > 0 || (p.one && !['hCheck', 'hBrake'].includes(p.one.name));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- main step
export function step(S, input = {}) {
  const dt = DT;
  S.t += dt; S.phaseT += dt; S.events.length = 0;
  const pk = S.puck;
  if (S.phase === 'faceoff') {
    if (S.phaseT > 0.9) dropPuck(S, input);
  } else if (S.phase === 'whistle' || S.phase === 'intermission') {
    if (S.phaseT > (S.phase === 'intermission' ? 2.5 : 1.4)) afterWhistle(S);
  }
  const live = S.phase === 'play';
  // intents
  for (const p of S.skaters) {
    p.cool = Math.max(0, p.cool - dt);
    if (!live && S.phase !== 'faceoff') { p.intent = { mx: 0, mz: 0 }; continue; }
    if (S.phase === 'faceoff' || p.benched) { p.intent = { mx: 0, mz: 0 }; continue; }
    p.intent = p.script ? p.script(S, p) : p === S.user && !S.auto && input.active ? userIntent(S, p, input) : aiIntent(S, p);
  }
  if (live) for (const p of S.skaters) actions(S, p);
  for (const p of S.skaters) move(S, p, dt);
  collide(S);
  if (live || S.phase === 'whistle') puckStep(S, dt);
  if (live && !S.mode.shootout && !S.mode.lab) {
    tickPenalties(S, dt);
    S.clock -= dt;
    if (S.clock <= 0) { S.clock = 0; endPeriod(S); }
  }
  if (S.mode.shootout || S.shootout) shootoutStep(S);
  // debug trail
  const tr = S.debug.trails; tr.push([pk.x, pk.z, pk.owner ? 1 : 0]); if (tr.length > 180) tr.shift();
  if (S.debug.marks.length > 40) S.debug.marks.splice(0, S.debug.marks.length - 40);
}

// ---------------------------------------------------------------- user input
// input: { active, x, z (stick, screen-mapped to rink), pass (pressed), shootDown, shootUp, held }
function userIntent(S, p, inp) {
  const it = { mx: inp.x || 0, mz: inp.z || 0 };
  const own = S.puck.owner === p;
  if (own) {
    if (inp.pass) it.pass = choosePassTarget(S, p, inp.x, inp.z);
    if (inp.shootUp) it.shoot = inp.held > 0.25 ? 'slap' : 'wrist';
    it.aim = { x: inp.x, z: inp.z };
  } else {
    if (inp.pass) it.switch = true;
    if (inp.shootDown) it.check = true;
  }
  return it;
}

// ---------------------------------------------------------------- actions
function actions(S, p) {
  const it = p.intent, pk = S.puck;
  if (p.one) {
    const a = HOCKEY[p.one.name];
    p.one.t += DT;
    if ((p.one.name === 'hShoot' || p.one.name === 'hSlap') && !p.one.fired && p.one.t >= a.dur * a.release && pk.owner === p) { p.one.fired = true; releaseShot(S, p, p.one.name === 'hSlap' ? 'slap' : 'wrist'); }
    if (p.one.name === 'hPass' && !p.one.fired && p.one.t >= a.dur * a.release && pk.owner === p) { p.one.fired = true; releasePass(S, p); }
    if (p.one.name === 'hCheck' && !p.one.fired && p.one.t >= a.dur * a.hit) { p.one.fired = true; checkHit(S, p); }
    if (p.one && p.one.t >= a.dur) { if (p.one.name === 'hFall') p.down = 0.5; p.one = null; }   // a penalty can clear p.one mid-check
  }
  if (p.benched) return;
  if (p.down > 0 && !p.one) p.down = Math.max(0, p.down - DT);
  if (it.switch && p === S.user) { switchUser(S); return; }
  if (busy(p) || p.one) return;
  if (p.isG) return;
  if (pk.owner === p) {
    if (it.shoot && p.cool <= 0) {
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw), dx = pk.x - p.x, dz = pk.z - p.z;
      p.hold = { f: dx * c + dz * s, r: -dx * s + dz * c }; p.aim = it.aim;
      start(p, it.shoot === 'slap' ? 'hSlap' : 'hShoot'); p.cool = 0.8;
    } else if (it.pass && p.cool <= 0) {
      p.passTo = it.pass; start(p, 'hPass'); p.cool = 0.4;
      if (p === S.user && it.pass) S.user = it.pass;    // arcade: control follows the pass
    }
  } else if (it.check && p.cool <= 0) {
    const carrier = pk.owner && pk.owner.team !== p.team ? pk.owner : null;
    const sp = Math.hypot(p.vx, p.vz);
    if (carrier && dist(p, carrier) < SKATE.pokeReach && sp < 4) poke(S, p, carrier);
    else { start(p, 'hCheck'); p.one.closing = bestClosing(S, p); p.cool = 1.0; }
  }
  const sp = Math.hypot(p.vx, p.vz), ml = Math.hypot(it.mx, it.mz);
  if (sp > 5 && ml > 0.5 && (p.vx * it.mx + p.vz * it.mz) / (sp * ml) < -0.6) start(p, 'hBrake');
}

function releaseShot(S, p, kind) {
  const pk = S.puck, cfg = SHOT[kind], d = attackDir(S, p.team);
  const gx = d * RINK.goalX;
  // aim: stick side picks a corner; AI aims with a little error
  const az = p.aim && Math.abs(p.aim.z) > 0.3 ? Math.sign(p.aim.z) * d * 0.7 : (S.R() - 0.5) * 1.5;
  const tz = az + (S.R() - 0.5) * cfg.spread * 2;
  const ty = cfg.lift[0] + S.R() * (cfg.lift[1] - cfg.lift[0]);
  const dx = gx - pk.x, dz = tz - pk.z, L = Math.hypot(dx, dz);
  pk.owner = null; pk.vx = dx / L * cfg.speed; pk.vz = dz / L * cfg.speed; pk.vy = ty; pk.lock = 0.12; pk.lastTouch = p; S.touch++;
  pk.shot = { by: p, team: p.team, kind, from: { x: pk.x, z: pk.z }, t: S.t, resolved: {} };
  S.stats[p.team].shots++;
  log(S, 'shot', { team: p.team, kind, speed: cfg.speed, from: [+pk.x.toFixed(2), +pk.z.toFixed(2)] });
  S.debug.marks.push({ x: pk.x, z: pk.z, kind: 'shot', t: S.t });
}
function releasePass(S, p) {
  const pk = S.puck, q = p.passTo;
  if (!q) return;
  const d = dist(p, q), speed = Math.max(SHOT.pass.min, Math.min(SHOT.pass.max, 8 + d * 0.55));
  const lp = leadPass(pk, { x: q.x + Math.cos(q.yaw) * 0.9, z: q.z + Math.sin(q.yaw) * 0.9, vx: q.vx, vz: q.vz }, speed) || { vx: (q.x - pk.x) / d * speed, vz: (q.z - pk.z) / d * speed };
  pk.owner = null; pk.vx = lp.vx; pk.vz = lp.vz; pk.vy = 0; pk.lock = 0.1; pk.lastTouch = p; pk.pass = { from: p, to: q, team: p.team }; pk.shot = null; S.touch++;
  S.stats[p.team].passes++;
  log(S, 'pass', { team: p.team, from: p.id, to: q.id, speed: +speed.toFixed(1) });
}
function checkHit(S, p) {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  let best = null, bd = SKATE.checkReach;
  for (const q of S.skaters) {
    if (q.team === p.team || q.down > 0 || q.isG || q.benched) continue;
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    if (d > bd || (dx * c + dz * s) / (d || 1) < 0.2) continue;     // must be in front of the shoulder
    best = q; bd = d;
  }
  if (!best) return;
  const nx = (best.x - p.x) / (bd || 1), nz = (best.z - p.z) / (bd || 1);
  const closing = Math.max((p.vx - best.vx) * nx + (p.vz - best.vz) * nz, (p.one && p.one.closing) || 0);
  log(S, 'check', { by: p.id, on: best.id, closing: +closing.toFixed(2) });
  const hadPuck = S.puck.owner === best || dist(S.puck, best) < 2.5;
  if (closing > SKATE.checkMinSpeed) {
    // momentum goes into the hit: the target is knocked along the line of contact
    best.vx = best.vx * 0.3 + nx * closing * 0.8; best.vz = best.vz * 0.3 + nz * closing * 0.8;
    p.vx *= 0.5; p.vz *= 0.5;
    start(best, 'hFall'); best.down = 1;
    const pk = S.puck;
    if (pk.owner === best) { pk.owner = null; pk.vx = best.vx + nx * 2; pk.vz = best.vz + nz * 2; pk.lock = 0.25; S.touch++; }
    S.stats[p.team].hits++;
    S.debug.marks.push({ x: best.x, z: best.z, kind: 'hit', t: S.t });
    if (S.penaltiesOn) judgeHit(S, p, best, nx, nz, closing, hadPuck);
  } else { best.vx += nx * closing * 0.5; best.vz += nz * closing * 0.5; }
}
function bestClosing(S, p) {
  let m = 0;
  for (const q of S.skaters) {
    if (q.team === p.team || q.isG || q.benched) continue;
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    if (d < 2.5) m = Math.max(m, ((p.vx - q.vx) * dx + (p.vz - q.vz) * dz) / (d || 1));
  }
  return m;
}
function poke(S, p, carrier) {
  const pk = S.puck;
  const ok = S.R() < 0.55;
  log(S, 'poke', { by: p.id, on: carrier.id, ok });
  p.cool = 0.7;
  if (!ok) { if (S.penaltiesOn && S.R() < PENALTY.chance.hooking) callPenalty(S, p, 'hooking'); return; }
  const dx = pk.x - p.x, dz = pk.z - p.z, d = Math.hypot(dx, dz) || 1;
  pk.owner = null; pk.vx = carrier.vx * 0.5 + dx / d * 4 + (S.R() - 0.5) * 3; pk.vz = carrier.vz * 0.5 + dz / d * 4 + (S.R() - 0.5) * 3; pk.lock = 0.2; S.touch++;
}
export function switchUser(S) {
  const pk = S.puck;
  const mates = S.skaters.filter((q) => q.team === S.userTeam && !q.isG && q !== S.user);
  if (!mates.length) return;
  S.user = mates.reduce((a, b) => (dist(b, pk) < dist(a, pk) ? b : a));
}

// ---------------------------------------------------------------- movement
function move(S, p, dt) {
  const it = p.intent || { mx: 0, mz: 0 };
  if (p.isG) return goalieMove(S, p, dt);
  let wx = it.mx, wz = it.mz;
  const ml = Math.hypot(wx, wz);
  const sp = Math.hypot(p.vx, p.vz);
  const carrying = S.puck.owner === p;
  const top = SKATE.max * (carrying ? SKATE.carryFactor : 1) * Math.min(1, ml);
  const braking = p.one && p.one.name === 'hBrake';
  const shooting = p.one && (p.one.name === 'hShoot' || p.one.name === 'hSlap');
  let ax = 0, az = 0;
  if (p.down > 0 || (p.one && p.one.name === 'hFall')) {
    const k = Math.max(0, sp - 5 * dt) / (sp || 1); p.vx *= k; p.vz *= k;
  } else if (braking) {
    const k = Math.max(0, sp - SKATE.brake * dt) / (sp || 1); p.vx *= k; p.vz *= k;
  } else if (ml > 0.05) {
    const tx = wx / ml * top, tz = wz / ml * top * 1;
    let dvx = tx - p.vx, dvz = tz - p.vz;
    if (sp > 1) {
      // split into along-track and lateral parts with separate limits (edges give lateral grip)
      const ux = p.vx / sp, uz = p.vz / sp;
      let al = dvx * ux + dvz * uz, la = -dvx * uz + dvz * ux;
      const amax = (al > 0 ? SKATE.accel : SKATE.brake * 0.5) * (shooting ? 0.3 : 1) * dt, lmax = SKATE.lateral * dt;
      al = Math.max(-amax, Math.min(amax, al)); la = Math.max(-lmax, Math.min(lmax, la));
      ax = al * ux - la * uz; az = al * uz + la * ux;
    } else {
      const dl = Math.hypot(dvx, dvz), a = SKATE.accel * dt;
      if (dl > a) { ax = dvx / dl * a; az = dvz / dl * a; } else { ax = dvx; az = dvz; }
    }
    p.vx += ax; p.vz += az;
  } else if (sp > 0) { const k = Math.max(0, sp - SKATE.glide * dt) / sp; p.vx *= k; p.vz *= k; }
  p.x += p.vx * dt; p.z += p.vz * dt;
  boards(p, SKATE.bodyR, 0.2, 0.9);
  keepOutOfNets(p);
  const sp2 = Math.hypot(p.vx, p.vz);
  if (sp2 > 0.6 && !braking) {
    const target = Math.atan2(p.vz, p.vx);
    const d = ((target - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    p.yaw += Math.sign(d) * Math.min(Math.abs(d), SKATE.turnRate / (1 + sp2 * 0.08) * dt);
  } else if (ml > 0.2 && !p.one) {
    const target = Math.atan2(wz, wx), d = ((target - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    p.yaw += Math.sign(d) * Math.min(Math.abs(d), 4 * dt);
  }
  const acc = Math.hypot(ax, az) / dt;
  p.act = acc > 1.5 || (sp2 > 3 && ml > 0.6) ? 'hSkate' : 'hGlide';
  p.ph = (p.ph + dt / HOCKEY[p.act].dur * (p.act === 'hSkate' ? Math.max(0.7, Math.min(1.35, sp2 / 6.5)) : 1)) % 1;
}
function keepOutOfNets(p) {
  for (const side of [1, -1]) {
    const gx = side * RINK.goalX, back = gx + side * RINK.netDepth, r = SKATE.bodyR;
    if ((p.x - (gx - side * r * 0.2)) * side > 0 && (p.x - (back + side * r)) * side < 0 && Math.abs(p.z) < RINK.mouth + r) {
      const toBack = Math.abs(p.x - (back + side * r)), toSide = RINK.mouth + r - Math.abs(p.z);
      if (toSide < toBack) { p.z = Math.sign(p.z || 1) * (RINK.mouth + r); p.vz *= -0.2; } else { p.x = back + side * r; p.vx *= -0.2; }
    }
  }
}
function goalieMove(S, g, dt) {
  const pk = S.puck, d = attackDir(S, g.team), net = { x: -d * RINK.goalX, z: 0 };
  // stand on the line from the net centre to the puck, further out when the puck is far
  const dx = pk.x - net.x, dz = pk.z - net.z, D = Math.hypot(dx, dz) || 1;
  const depth = GOALIE.depthMin + (GOALIE.depthMax - GOALIE.depthMin) * Math.min(1, D / 15);
  let tx = net.x + dx / D * depth, tz = net.z + dz / D * depth;
  if ((tx - net.x) * d < 0.3) { tx = net.x + d * 0.3; tz = Math.max(-RINK.mouth * 0.8, Math.min(RINK.mouth * 0.8, pk.z)); }
  if (S.puck.owner === g) { tx = g.x; tz = g.z; }
  const ex = tx - g.x, ez = tz - g.z, el = Math.hypot(ex, ez), v = Math.min(GOALIE.lateral, el * 8);
  g.vx = el > 1e-4 ? ex / el * v : 0; g.vz = el > 1e-4 ? ez / el * v : 0;
  g.x += g.vx * dt; g.z += g.vz * dt;
  g.yaw = Math.atan2(pk.z - g.z, pk.x - g.x);
  g.act = 'gStance'; g.ph = (g.ph + dt / HOCKEY.gStance.dur) % 1;
}
function collide(S) {
  const sk = S.skaters;
  for (let i = 0; i < sk.length; i++) for (let j = i + 1; j < sk.length; j++) {
    const a = sk[i], b = sk[j]; if (a.benched || b.benched) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = SKATE.bodyR * 2;
    if (d >= min || d < 1e-6) continue;
    const nx = dx / d, nz = dz / d, wa = a.isG ? 0.1 : 0.5, wb = b.isG ? 0.1 : 0.5, push = min - d;
    a.x -= nx * push * wa / (wa + wb) * 2 * 0.5; a.z -= nz * push * wa / (wa + wb) * 2 * 0.5;
    b.x += nx * push * wb / (wa + wb) * 2 * 0.5; b.z += nz * push * wb / (wa + wb) * 2 * 0.5;
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0) { const k = rv * 0.5; a.vx += k * nx; a.vz += k * nz; b.vx -= k * nx; b.vz -= k * nz; }
  }
}

// ---------------------------------------------------------------- puck
function puckStep(S, dt) {
  const pk = S.puck;
  pk.lock = Math.max(0, pk.lock - dt);
  const o = pk.owner;
  if (o) {
    if (o.isG) { pk.x = o.x + Math.cos(o.yaw) * 0.3; pk.z = o.z + Math.sin(o.yaw) * 0.3; pk.y = 0.6; pk.vx = pk.vz = 0; return; }
    let tx, tz;
    if (o.one && (o.one.name === 'hShoot' || o.one.name === 'hSlap') && o.hold) {
      const c = Math.cos(o.yaw), s = Math.sin(o.yaw); tx = o.x + o.hold.f * c - o.hold.r * s; tz = o.z + o.hold.f * s + o.hold.r * c;
    } else { const b = bladeOf(o); tx = b.x; tz = b.z; }
    // the puck rides with the skater and eases onto the blade: a received puck, a turn or an
    // animation change never makes it jump more than MAXC per frame beyond the skater's own motion
    const MAXC = 0.12;
    pk.x += o.vx * dt; pk.z += o.vz * dt;
    const ex = tx - pk.x, ez = tz - pk.z, el = Math.hypot(ex, ez);
    const k = pk.settle > 0 ? Math.min(1, dt / pk.settle) : 0.6, c = Math.min(el * k, MAXC);
    if (el > 1e-6) { pk.x += ex / el * c; pk.z += ez / el * c; }
    pk.settle = Math.max(0, pk.settle - dt);
    pk.y = 0; pk.vx = o.vx; pk.vz = o.vz; pk.vy = 0;
    return;
  }
  // goalie save attempts happen before the puck moves past them
  for (const g of S.skaters) if (g.isG && pk.shot && !pk.shot.resolved[g.id] && g.team !== pk.shot.team) trySave(S, g);
  const bodies = S.skaters.map((p) => (p.isG && pk.shot && pk.shot.resolved[p.id] === 'beat') || p === pk.lastTouch && pk.lock > 0 ? { x: 1e9, z: 1e9, r: 0 } : { x: p.x, z: p.z, vx: p.vx, vz: p.vz, r: p.isG ? GOALIE.body : PUCK.bodyR });
  const ev = stepPuck(pk, dt, bodies);
  for (const e of ev) {
    if (e.startsWith('goal:')) return goal(S, +e.split(':')[1]);
    if (e === 'post' || e === 'crossbar') { log(S, e); S.debug.marks.push({ x: pk.x, z: pk.z, kind: 'post', t: S.t }); }
    if (e.startsWith('body:')) { const b = S.skaters[+e.split(':')[1]]; pk.lastTouch = b; log(S, 'deflect', { off: b.id }); }
    if (e === 'board') log(S, 'board');
    if (e === 'net') log(S, 'net');
  }
  // pickups and interceptions: each skater gets one try per touch of the puck
  if (pk.lock <= 0 && pk.inNet <= 0) {
    const sp = Math.hypot(pk.vx, pk.vz);
    const order = S.skaters.slice().sort((a, b) => dist(a, pk) - dist(b, pk));
    for (const p of order) {
      if (p.down > 0 || busy(p) || (p.tried === S.touch && S.t - p.tryT < 0.35) || p.isG || p.benched) continue;
      const b = bladeOf(p), reach = PUCK.receiveReach + (pk.pass && pk.pass.to === p ? 0.35 : 0);
      if (Math.hypot(b.x - pk.x, b.z - pk.z) > reach || pk.y > 0.6) continue;
      p.tried = S.touch; p.tryT = S.t;
      const rel = Math.hypot(pk.vx - p.vx, pk.vz - p.vz);
      const intended = pk.pass && pk.pass.to === p;
      const chance = rel > PUCK.maxControl ? 0 : intended ? 0.97 - rel * 0.012 : 0.9 - (rel / PUCK.maxControl) * 0.75;
      if (S.R() < chance) { take(S, p); break; }
      else if (rel > 6) {          // touched but not controlled: a tip that changes its line
        const a = (S.R() - 0.5) * 0.8, c = Math.cos(a), s = Math.sin(a), vx = pk.vx * 0.7, vz = pk.vz * 0.7;
        pk.vx = vx * c - vz * s; pk.vz = vx * s + vz * c; pk.lastTouch = p; S.touch++; log(S, 'tip', { by: p.id });
      }
    }
  }
}
function take(S, p) {
  const pk = S.puck, was = pk.pass;
  pk.owner = p; pk.settle = PUCK.settle; pk.shot = null; pk.lastTouch = p;
  if (was) {
    if (was.team === p.team) { S.stats[p.team].passesDone++; log(S, 'reception', { by: p.id }); }
    else { S.stats[p.team].intercepts++; log(S, 'interception', { by: p.id }); }
  } else log(S, 'pickup', { by: p.id });
  pk.pass = null;
  if (p.team === S.userTeam && !S.auto) S.user = p;
}
function trySave(S, g) {
  const pk = S.puck, sh = pk.shot;
  // where does the puck pass the goalie? closest approach of its straight path
  const sp = Math.hypot(pk.vx, pk.vz); if (sp < 3) return;
  const ux = pk.vx / sp, uz = pk.vz / sp, rx = g.x - pk.x, rz = g.z - pk.z, along = rx * ux + rz * uz;
  if (along < 0 || along > sp * 0.05 + 0.6) return;         // only when it's about to reach him
  const lat = Math.abs(-rx * uz + rz * ux);
  const flight = dist(sh.from, g) / sp;                      // reaction time he had
  const cover = GOALIE.body + GOALIE.reach * Math.min(1, flight / GOALIE.react) - (pk.y > 1.0 ? 0.15 : 0);
  const saved = lat < cover * (0.7 + S.R() * 0.5);
  sh.resolved[g.id] = saved ? 'save' : 'beat';
  if (!saved) return;
  S.stats[g.team].saves++;
  const high = pk.y > 0.45, gloveSide = (-rx * uz + rz * ux) * attackDir(S, sh.team) > 0;
  start(g, high ? (gloveSide ? 'gGlove' : 'gBlocker') : 'gButterfly');
  if (sp < GOALIE.catchSpeed && high && S.R() < 0.6) {
    pk.owner = g; pk.vx = pk.vz = 0; pk.shot = null; log(S, 'save', { by: g.id, kind: 'catch' });
    S.phase = 'whistle'; S.phaseT = 0; S.banner = 'SAVE'; S.whistleFor = { kind: 'freeze', x: g.x };
  } else {
    // rebound off the pads or blocker: away from the net with a random kick
    const d = attackDir(S, g.team), a = (S.R() - 0.5) * 2.2;
    const out = sp * (0.25 + S.R() * 0.2);
    pk.vx = d * Math.cos(a) * out; pk.vz = Math.sin(a) * out; pk.vy = high ? 1.5 : 0; pk.x = g.x + d * 0.5; pk.z = g.z + Math.sin(a) * 0.3;
    pk.lock = 0.1; pk.lastTouch = g; S.touch++; pk.shot.resolved[g.id] = 'save';
    log(S, 'save', { by: g.id, kind: 'rebound' }); S.debug.marks.push({ x: pk.x, z: pk.z, kind: 'save', t: S.t });
  }
}
function goal(S, end) {
  // a goal in the +x net counts for whoever attacks +x this period
  const team = attackDir(S, 0) === end ? 0 : 1;
  S.score[team]++; S.stats[team].goals++;
  const by = S.puck.lastTouch;
  const strength = strengthOf(S, team);
  log(S, 'goal', { team, by: by ? by.id : null, score: [...S.score], strength, manpower: [...S.manpower] });
  if (strength === 'PP') { const pen = S.box.filter((b) => b.team !== team && b.serving).sort((a, b) => a.left - b.left)[0]; if (pen) releasePenalty(S, pen, 'ppGoal'); }
  S.banner = `${TEAMS[team].short} GOAL`;
  S.phase = 'whistle'; S.phaseT = 0; S.whistleFor = { kind: 'goal', team };
  if (S.shootout) S.shootout.scored = true;
}
function afterWhistle(S) {
  const w = S.whistleFor || {}; S.banner = '';
  if (S.shootout) return;
  if (S.mode.lab) { S.phase = 'play'; return; }
  if (w.kind === 'goal' && S.mode.suddenDeath) return endGame(S);
  if (S.phase === 'intermission') {
    if (S.nextMode) { const m = MODES[S.nextMode]; S.mode = m; S.modeKey = S.nextMode; S.nextMode = null; if (!m.keepBox) clearBox(S, 'format-change'); if (m.shootout) return startShootout(S); if (!m.keepBox) setLineups(S, m.skaters, m.goalies); S.clock = m.periodSec; }
    return faceoffAt(S, 0, 0);
  }
  if (w.kind === 'freeze') { const side = Math.sign(w.x) || 1; return faceoffAt(S, side * RINK.dotX, (S.R() < 0.5 ? 1 : -1) * RINK.dotZ); }
  if (w.kind === 'penalty') { const side = -attackDir(S, w.team); return faceoffAt(S, side * RINK.dotX, (S.R() < 0.5 ? 1 : -1) * RINK.dotZ); }
  faceoffAt(S, 0, 0);
}
function endPeriod(S) {
  log(S, 'periodEnd', { period: S.period, score: [...S.score] });
  if (S.period < S.mode.periods) { S.period++; S.clock = S.periodSec; S.phase = 'intermission'; S.phaseT = 0; S.banner = `END OF PERIOD ${S.period - 1}`; S.whistleFor = {}; return; }
  if (S.score[0] === S.score[1] && S.mode.ot) { S.nextMode = S.mode.ot; S.period++; S.phase = 'intermission'; S.phaseT = 0; S.banner = MODES[S.mode.ot].banner; S.whistleFor = {}; return; }
  if (S.score[0] === S.score[1] && S.mode.then) { S.nextMode = S.mode.then; S.phase = 'intermission'; S.phaseT = 0; S.banner = 'SHOOTOUT'; S.whistleFor = {}; return; }
  endGame(S);
}
function endGame(S) { S.phase = 'final'; S.phaseT = 0; S.banner = `FINAL${S.score[0] === S.score[1] ? ' · TIE' : ''} ${TEAMS[0].short} ${S.score[0]} – ${S.score[1]} ${TEAMS[1].short}`; log(S, 'final', { score: [...S.score] }); }

// ---------------------------------------------------------------- penalties
export const penaltySeconds = (S) => PENALTY.minorSec * ((S.mode.penaltyScale || PENALTY.scale) === 'proportional' ? (S.mode.periodSec || 1200) / 1200 : 1);
const onIce = (S, team) => S.skaters.filter((p) => p.team === team && !p.isG && !p.benched).length;
const hasGoalie = (S, team) => S.skaters.some((p) => p.team === team && p.isG);
function updateManpower(S) { S.manpower = [onIce(S, 0), onIce(S, 1)]; }
/** 'EV', 'PP', 'SH' or 'EN' (into an empty net) for a goal by `team`, from who was on the ice. */
export function strengthOf(S, team) {
  if (!hasGoalie(S, 1 - team)) return 'EN';
  const a = onIce(S, team), b = onIce(S, 1 - team);
  return a > b ? 'PP' : a < b ? 'SH' : 'EV';
}
function judgeHit(S, p, q, nx, nz, closing, hadPuck) {
  const C = PENALTY.chance;
  const behind = Math.cos(q.yaw) * nx + Math.sin(q.yaw) * nz > 0.5;          // he was facing away from the hitter
  const nearBoards = Math.abs(q.x) > RINK.hx - 1.6 || Math.abs(q.z) > RINK.hz - 1.6;
  if (behind && nearBoards && S.R() < C.boarding) return callPenalty(S, p, 'boarding');
  if (closing > PENALTY.chargingSpeed && S.R() < C.charging) return callPenalty(S, p, 'charging');
  if (!hadPuck && S.R() < C.interference) return callPenalty(S, p, 'interference');
}
/** Send p off for a minor. Immediate call (no delayed penalty). Returns true if called. */
export function callPenalty(S, p, kind) {
  if (!S.penaltiesOn || S.phase !== 'play' || p.isG || p.benched || S.shootout || S.mode.lab) return false;
  const len = penaltySeconds(S);
  const pen = { team: p.team, player: p.id, kind, len, left: len, serving: false, pending: false, t: S.t };
  S.box.push(pen);
  log(S, 'penalty', { team: p.team, player: p.id, kind, sec: +len.toFixed(1) });
  // two already serving: a substitute keeps the team at three skaters and this one waits its turn
  if (S.box.filter((b) => b.team === p.team && b.serving).length < PENALTY.maxServing) servePenalty(S, pen); else pen.pending = true;
  S.phase = 'whistle'; S.phaseT = 0; S.banner = `${TEAMS[p.team].short} ${kind.toUpperCase()}`; S.whistleFor = { kind: 'penalty', team: p.team };
  return true;
}
function servePenalty(S, pen) {
  const p = S.skaters[pen.player];
  pen.serving = true; pen.pending = false;
  const wouldBe = onIce(S, p.team) - 1;
  Object.assign(p, { benched: true, inBox: true, x: (p.team ? 3 : -3), z: -(RINK.hz + 1.6), vx: 0, vz: 0, one: null, down: 0 });
  if (wouldBe < 3) {
    // never fewer than three skaters: a substitute comes on, and (as in NHL 3-on-3 overtime)
    // the other team gets an extra skater instead, so 3 on 3 becomes 4 on 3
    pen.sub = addSkater(S, p.team, p.role, { x: (p.team ? 3 : -3), z: -(RINK.hz - 1.0) }).id;
    pen.bonus = addSkater(S, 1 - p.team, 'X', { x: (p.team ? -3 : 3), z: -(RINK.hz - 1.0) }).id;
  }
  if (S.puck.owner === p) S.puck.owner = null;
  if (S.user === p) switchUser(S);
  updateManpower(S);
  log(S, 'penaltyServe', { team: pen.team, player: pen.player, manpower: [...S.manpower] });
}
function releasePenalty(S, pen, why) {
  S.box.splice(S.box.indexOf(pen), 1);
  if (pen.serving) { const p = S.skaters[pen.player]; Object.assign(p, { benched: false, inBox: false, x: (p.team ? 3 : -3), z: -(RINK.hz - 1.0), vx: 0, vz: 3 }); }
  // temporary skaters leave (kept in the list, retired, so skater ids in the log stay stable)
  for (const id of [pen.sub, pen.bonus]) if (id != null) { const q = S.skaters[id]; if (S.puck.owner === q) S.puck.owner = null; Object.assign(q, { benched: true, retired: true }); if (S.user === q) switchUser(S); }
  const next = S.box.find((b) => b.team === pen.team && b.pending);
  if (next) servePenalty(S, next);
  updateManpower(S);
  log(S, 'penaltyEnd', { team: pen.team, player: pen.player, kind: pen.kind, why, manpower: [...S.manpower] });
}
function tickPenalties(S, dt) {
  for (const pen of S.box.slice()) if (pen.serving) { pen.left -= dt; if (pen.left <= 0) releasePenalty(S, pen, 'expired'); }
}
function clearBox(S, why) { for (const pen of S.box.slice()) releasePenalty(S, pen, why); }

// ---------------------------------------------------------------- shootout
function startShootout(S) {
  S.shootout = { round: 0, turn: 0, goals: [0, 0], taken: [0, 0], scored: false, rounds: MODES.shootout.rounds };
  S.period = 1;
  setLineups(S, [3, 3], [true, true]);
  nextAttempt(S);
}
function nextAttempt(S) {
  const so = S.shootout, team = so.turn;
  const d = attackDir(S, team);
  for (const p of S.skaters) { Object.assign(p, { vx: 0, vz: 0, one: null, down: 0, benched: false }); if (!p.isG) { p.x = -d * 25 * (p.team === team ? 1 : 1) + (p.id % 3) * 2; p.z = (p.team ? 1 : -1) * 11; p.benched = true; } }
  const shooter = S.skaters.find((p) => p.team === team && p.role === 'C');
  shooter.benched = false; shooter.x = -d * 1; shooter.z = 0; shooter.yaw = d > 0 ? 0 : Math.PI;
  for (const g of S.skaters.filter((p) => p.isG)) { g.x = -attackDir(S, g.team) * (RINK.goalX - 0.6); g.z = 0; }
  Object.assign(S.puck, { x: shooter.x + d * 0.9, z: 0, y: 0, vx: 0, vz: 0, owner: shooter, settle: 0, shot: null, inNet: 0, pass: null });
  so.shooter = shooter; so.scored = false; so.t0 = S.t; S.phase = 'play'; S.phaseT = 0; S.banner = `${TEAMS[team].short} SHOOTER`;
  if (team === S.userTeam) S.user = shooter;
}
function shootoutStep(S) {
  const so = S.shootout; if (!so || S.phase === 'final') return;
  const pk = S.puck, el = S.t - so.t0;
  const dead = so.scored || el > 9 || (el > 1.5 && !pk.owner && Math.hypot(pk.vx, pk.vz) < 1.5) || (pk.owner && pk.owner.isG) || (pk.owner && pk.owner.team !== so.turn);
  if (!dead) return;
  if (S.phase === 'whistle' && S.phaseT < 1.2) return;
  so.taken[so.turn]++; if (so.scored) so.goals[so.turn]++;
  log(S, 'attempt', { team: so.turn, scored: so.scored, goals: [...so.goals] });
  S.score = [...so.goals];
  const [a, b] = so.taken, [ga, gb] = so.goals, left = (n) => Math.max(0, so.rounds - n);
  const decided = (a === b && a >= so.rounds && ga !== gb) || (a <= so.rounds && b <= so.rounds && (ga > gb + left(b) || gb > ga + left(a))) || (a > so.rounds && a === b && ga !== gb);
  if (decided) { S.score[ga > gb ? 0 : 1] += 0; return endGame(S); }
  so.turn = 1 - so.turn; nextAttempt(S);
}

export function animOf(p) {
  if (p.one) return { name: p.one.name, t: p.one.t };
  return { name: p.act, t: p.ph * HOCKEY[p.act].dur };
}
