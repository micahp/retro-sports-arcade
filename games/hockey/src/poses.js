// Hockey adapter for Gridiron's sprite-stack body (web/stack/, copied unmodified
// from gridiron-physics@49c4000). It adds a stick and skate blades to the body
// and authors hockey actions on Gridiron's skeleton. Nothing in web/stack/ is
// edited: this file only pushes parts and actions into the exported PARTS and
// ACTIONS objects before anything bakes.
//
// Gridiron's body has no world-space props except its hard-coded football
// (ballPart). A part's shape only sees its own joint frame, so the stick is
// solved here in body space for each pose (top hand to blade on the ice) and
// handed to the part through a module variable. That hook is the main adapter
// cost and the first thing to generalise if the stack becomes shared tech.
import { PARTS, PAL, sdRoundBox, sdCone } from '../vendor/stack/body.js';
import { holdStick, checkStick, STICK_SPEC } from '../../shared/stick/stick.js';
import { ACTIONS } from '../vendor/stack/actions.js';
import { fk, D, sampleKeys, apply, applyT } from '../vendor/stack/skeleton.js';

const deg = (a) => a.map((x) => (typeof x === 'number' ? x * D : x));
const at = (J, n, c) => { const o = J[n].R, p = J[n].p; return [p[0] + o[0] * c[0] + o[1] * c[1] + o[2] * c[2], p[1] + o[3] * c[0] + o[4] * c[1] + o[5] * c[2], p[2] + o[6] * c[0] + o[7] * c[1] + o[8] * c[2]]; };
const SOLE = -0.125, BLADE_HALF = 0.15;
// Furthest the drawn stick may reach from the pelvis in x or z: inside voxelize's +-1.15 m footprint
// with a margin for the shaft and blade thickness.
export const REACH_LIMIT = 1.08;

/** Lowest point of the skate blades in FK body space: where the ice is for this pose. */
export function groundY(J) {
  let y = 1e9;
  for (const a of ['anR', 'anL']) for (const x of [-BLADE_HALF + 0.05, BLADE_HALF + 0.05]) y = Math.min(y, at(J, a, [x, SOLE, 0])[1]);
  return y;
}

// Stick geometry per pose. ONE rigid stick, solved by the shared model: the blade
// heel is the authored target, the shaft length is fixed, and the toe continues the
// shaft's ground direction (it cannot point back at the body). The hands are then
// IK'd onto the shaft, so `T` is the real top-hand grip rather than a made-up point.
//
// This replaces the old two-stick arrangement: a drawn stick with shrinking
// heuristics plus a separate "physics" blade (H0/E0) that jutted sideways. The
// measured defect was a contact point 0.15-0.43 m from the drawn blade and a bottom
// hand 0.47-0.81 m off the shaft.
export function stickOf(J, s) {
  const g = groundY(J);
  const r = solveStickFor(J, s, g);
  return { T: r.stick.butt, H: r.stick.heel, E: r.stick.toe, H0: r.stick.heel, E0: r.stick.toe, g, _solved: r };
}

// Solve the stick + arms for an already-posed body. Kept separate so withStick can
// reuse the FK it needs.
function solveStickFor(J, s, g) {
  const heel = s.blade === 'drop'
    ? (() => { let floor = 1e9; for (const k in J) if (k[0] !== '_') floor = Math.min(floor, J[k].p[1] - 0.1); return [0.55, floor + 0.02, 0.55]; })()
    : [s.blade[0], s.blade[1] === 'ice' ? g + 0.03 : s.blade[1], s.blade[2]];
  // keep the whole drawn stick inside the voxel bake footprint: pull the authored
  // heel target toward the pelvis until the toe fits (the blade stays on the ice)
  const pelvis = J.pelvis.p;
  let target = heel.slice();
  for (let i = 0; i < 24; i++) {
    const r = holdStick(J._pose, target, {
      handed: s.handed || 'R',
      reach: s.reach ?? 0.62,
      tolerance: 0.04,
      spec: s.spec || STICK_SPEC,
    });
    const reachOut = Math.max(Math.abs(r.stick.toe[0]), Math.abs(r.stick.toe[2]), Math.abs(r.stick.butt[0]), Math.abs(r.stick.butt[2]));
    if (reachOut <= REACH_LIMIT) return r;
    target = [target[0] + (pelvis[0] - target[0]) * 0.06, target[1], target[2] + (pelvis[2] - target[2]) * 0.06];
  }
  return holdStick(J._pose, target, { handed: s.handed || 'R', reach: 0.45, tolerance: 0.05, spec: s.spec || STICK_SPEC });
}

// the current pose's stick, read by the stick part while that pose voxelises
let CUR = null;
const local = (J, w) => applyT(J.wrR.R, [w[0] - J.wrR.p[0], w[1] - J.wrR.p[1], w[2] - J.wrR.p[2]]);
const stickPart = {
  prio: 3, thin: true, joint: 'wrR', bounds: [[-0.1, -0.1, -0.1], [0.1, 0.1, 0.1]],
  sdf: (p) => (CUR ? Math.min(sdCone(p, CUR.t, CUR.h, 0.02, 0.018), sdCone(p, CUR.h, CUR.e, 0.026, 0.022)) : 1),
  mat: (p) => {
    if (!CUR) return PAL.BELT;
    const dh = Math.hypot(p[0] - CUR.h[0], p[1] - CUR.h[1], p[2] - CUR.h[2]);
    const dt = Math.hypot(p[0] - CUR.t[0], p[1] - CUR.t[1], p[2] - CUR.t[2]);
    return dh < 0.05 || sdCone(p, CUR.h, CUR.e, 0.03, 0.03) < 0 || dt < 0.07 ? PAL.SOLE : PAL.BELT;
  },
};
PARTS.push(stickPart);
// skate blades under the boots
for (const an of ['anR', 'anL']) {
  PARTS.push({
    prio: 2, thin: true, joint: an, bounds: [[-0.14, -0.15, -0.03], [0.24, -0.06, 0.03]],
    sdf: (p) => sdRoundBox(p, [0.05, SOLE + 0.025, 0], [BLADE_HALF, 0.022, 0.007], 0.006),
    mat: () => PAL.MASK,
  });
}

/** Attach the stick for one pose and return the pose with the hands solved onto it. */
function withStick(pose, s) {
  const J0 = fk(pose);
  const g = groundY(J0);
  const r = solveStickFor(J0, s, g);
  const J = fk(r.pose);
  const t = local(J, r.stick.butt), h = local(J, r.stick.heel), e = local(J, r.stick.toe);
  CUR = { t, h, e };
  const mn = [0, 1, 2].map((i) => Math.min(t[i], h[i], e[i]) - 0.06), mx = [0, 1, 2].map((i) => Math.max(t[i], h[i], e[i]) + 0.06);
  stickPart.bounds = [mn, mx];
  return { ...r.pose, _stick: r.stick, _stickOk: r.ok, _reach: r.reach };
}

// ---------------------------------------------------------------- poses
const UPPER = {
  spine: deg([10, 0, 0]), chest: deg([6, 0, 0]), neck: deg([-30, 0, 0]), head: deg([-8, 0, 0]),
  shL: deg([62, 22, 10]), elL: 70 * D, wrL: deg([10, 0]), gripL: 0.9,
  shR: deg([40, 12, 0]), elR: 30 * D, wrR: deg([0, 0]), gripR: 0.9,
};
const ON_ICE = { blade: [0.85, 'ice', 0.25] };

function skate(ph) {
  const leg = (q) => {
    const push = Math.max(0, Math.sin(q * Math.PI * 2));       // 0..1 while this leg pushes out
    const rec = Math.max(0, -Math.sin(q * Math.PI * 2));       // 0..1 while it swings back under
    return { hip: deg([62 - 46 * push + 10 * rec, 6 + 30 * push, -6 * push]), kn: (84 - 52 * push + 14 * rec) * D };
  };
  const R = leg(ph), L = leg(ph + 0.5), sw = Math.sin(ph * Math.PI * 2);
  return withStick({
    ...UPPER,
    root: { pitch: 34 * D, roll: 5 * D * sw, yaw: 4 * D * sw, lift: 0, x: 0, z: -0.05 * sw },
    chest: deg([6, 0, -8 * sw]), shL: deg([62 + 6 * sw, 22, 10]), shR: deg([40 - 8 * sw, 12, 0]),
    hipR: R.hip, knR: R.kn, hipL: L.hip, knL: L.kn, flatR: true, flatL: true,
  }, { blade: [0.85, 'ice', 0.25 - 0.08 * sw] });
}
function glide(ph) {
  const b = Math.sin(ph * Math.PI * 2) * 0.5 + 0.5;
  return withStick({
    ...UPPER,
    root: { pitch: (28 + 3 * b) * D, roll: 0, yaw: 0, lift: 0, x: 0, z: 0 },
    hipR: deg([52 + 4 * b, 9, 0]), knR: (70 + 6 * b) * D, hipL: deg([46 + 4 * b, 9, 0]), knL: (64 + 6 * b) * D, flatR: true, flatL: true,
  }, ON_ICE);
}
const stance = (o) => ({ ...UPPER, root: { pitch: 30 * D, roll: 0, yaw: 0, lift: 0, x: 0, z: 0 }, hipR: deg([50, 10, 0]), knR: 70 * D, hipL: deg([50, 10, 0]), knL: 70 * D, flatR: true, flatL: true, ...o });
const keysWithStick = (list, blades, extra = {}) => (t) => {
  const pose = sampleKeys(list, t, { base: stance({}) });
  // blade target: piecewise-linear over the same key times
  let i = 0; while (i < blades.length - 2 && t > blades[i + 1].t) i++;
  const a = blades[i], b = blades[i + 1], u = Math.max(0, Math.min(1, (t - a.t) / ((b.t - a.t) || 1)));
  const s = u * u * (3 - 2 * u);
  const y = (v) => (v === 'ice' ? 0.03 : v);
  return withStick(pose, { ...extra, blade: [a.b[0] + (b.b[0] - a.b[0]) * s, y(a.b[1]) + (y(b.b[1]) - y(a.b[1])) * s, a.b[2] + (b.b[2] - a.b[2]) * s] });
};

const SHOOT = keysWithStick([
  { t: 0, ...stance({}) },
  { t: 0.45, root: { pitch: 26 * D }, chest: deg([4, 0, 38]), spine: deg([8, 0, 16]), shL: deg([96, 34, 10]), elL: 50 * D, shR: deg([20, 46, 0]), elR: 40 * D, hipR: deg([40, 16, 0]), knR: 62 * D, hipL: deg([58, 8, 0]), knL: 80 * D },
  { t: 0.62, root: { pitch: 36 * D }, chest: deg([8, 0, -6]), spine: deg([10, 0, -4]), shL: deg([60, 20, 10]), elL: 70 * D, shR: deg([56, 8, 0]), elR: 20 * D, hipR: deg([60, 8, 0]), knR: 82 * D, hipL: deg([40, 16, 0]), knL: 60 * D },
  { t: 1, root: { pitch: 22 * D }, chest: deg([2, 0, -30]), spine: deg([6, 0, -14]), shL: deg([70, 30, 10]), elL: 40 * D, shR: deg([110, 20, 0]), elR: 20 * D, hipR: deg([56, 8, 0]), knR: 76 * D, hipL: deg([36, 18, 0]), knL: 58 * D },
], [
  { t: 0, b: [0.85, 'ice', 0.25] }, { t: 0.45, b: [-0.55, 0.9, 0.75] }, { t: 0.62, b: [0.75, 'ice', 0.35] }, { t: 1, b: [1.0, 1.05, -0.35] },
]);
const CHECK = keysWithStick([
  { t: 0, ...stance({}) },
  { t: 0.4, root: { pitch: 30 * D }, chest: deg([4, 0, 30]), shR: deg([30, 70, 0]), elR: 100 * D, shL: deg([50, 30, 10]), elL: 80 * D, hipR: deg([58, 18, 0]), knR: 84 * D, hipL: deg([40, 22, 0]), knL: 70 * D },
  { t: 0.6, root: { pitch: 38 * D }, chest: deg([6, 0, -24]), shR: deg([60, 64, 0]), elR: 70 * D, shL: deg([40, 20, 10]), elL: 70 * D, hipR: deg([30, 20, 0]), knR: 50 * D, hipL: deg([66, 14, 0]), knL: 90 * D },
  { t: 1, ...stance({}) },
], [{ t: 0, b: [0.85, 'ice', 0.25] }, { t: 0.5, b: [0.6, 0.35, 0.6] }, { t: 1, b: [0.85, 'ice', 0.25] }]);
const BRAKE = keysWithStick([
  { t: 0, ...stance({}) },
  { t: 0.3, root: { pitch: 8 * D, yaw: 62 * D, roll: -14 * D }, chest: deg([10, 0, -40]), neck: deg([-24, 0, -40]), hipR: deg([66, 30, 0]), knR: 96 * D, hipL: deg([60, 26, 0]), knL: 92 * D },
  { t: 0.7, root: { pitch: 10 * D, yaw: 62 * D, roll: -10 * D }, chest: deg([10, 0, -40]), neck: deg([-24, 0, -40]), hipR: deg([62, 28, 0]), knR: 92 * D, hipL: deg([56, 24, 0]), knL: 88 * D },
  { t: 1, ...stance({}) },
], [{ t: 0, b: [0.85, 'ice', 0.25] }, { t: 1, b: [0.85, 'ice', 0.25] }]);

// slap shot: bigger, slower backswing over the shoulder
const SLAP = keysWithStick([
  { t: 0, ...stance({}) },
  { t: 0.55, root: { pitch: 22 * D }, chest: deg([0, 0, 52]), spine: deg([6, 0, 22]), shL: deg([120, 40, 10]), elL: 30 * D, shR: deg([60, 60, 0]), elR: 30 * D, hipR: deg([36, 18, 0]), knR: 56 * D, hipL: deg([58, 8, 0]), knL: 80 * D },
  { t: 0.66, root: { pitch: 38 * D }, chest: deg([8, 0, -8]), spine: deg([10, 0, -6]), shL: deg([58, 20, 10]), elL: 60 * D, shR: deg([58, 8, 0]), elR: 14 * D, hipR: deg([62, 8, 0]), knR: 84 * D, hipL: deg([40, 16, 0]), knL: 60 * D },
  { t: 1, root: { pitch: 20 * D }, chest: deg([0, 0, -34]), spine: deg([4, 0, -16]), shL: deg([76, 34, 10]), elL: 30 * D, shR: deg([124, 22, 0]), elR: 14 * D, hipR: deg([56, 8, 0]), knR: 74 * D, hipL: deg([34, 18, 0]), knL: 56 * D },
], [
  { t: 0, b: [0.85, 'ice', 0.25] }, { t: 0.55, b: [-0.6, 1.5, 0.9] }, { t: 0.66, b: [0.8, 'ice', 0.4] }, { t: 1, b: [1.0, 1.4, -0.5] },
]);
// pass: short draw back and a low sweep through the puck
const PASS = keysWithStick([
  { t: 0, ...stance({}) },
  { t: 0.4, chest: deg([6, 0, 22]), shL: deg([70, 26, 10]), shR: deg([30, 24, 0]) },
  { t: 0.6, chest: deg([6, 0, -10]), shL: deg([58, 20, 10]), shR: deg([50, 10, 0]) },
  { t: 1, ...stance({}), chest: deg([6, 0, -16]) },
], [{ t: 0, b: [0.85, 'ice', 0.25] }, { t: 0.4, b: [0.2, 'ice', 0.6] }, { t: 0.6, b: [0.85, 'ice', 0.3] }, { t: 1, b: [1.0, 0.12, -0.1] }]);

// a hockey fall: stumble forward, knees, then flat on the ice with the stick out
const PRONE = ACTIONS.prone.fn(0);
const FALL = keysWithStick([
  { t: 0, ...stance({}) },
  { t: 0.3, root: { pitch: 58 * D }, neck: deg([-40, 0, 0]), hipR: deg([70, 12, 0]), knR: 100 * D, hipL: deg([40, 12, 0]), knL: 70 * D, shR: deg([90, 20, 0]), elR: 30 * D, shL: deg([100, 20, 10]), elL: 30 * D },
  { t: 1, ...PRONE, shR: deg([150, 20, 0]), elR: 20 * D, shL: deg([150, 20, 10]), elL: 20 * D },
], [{ t: 0, b: [0.85, 'ice', 0.25] }, { t: 1, b: [1.6, 'ice', 0.1] }]);

// goalie: wide crouch with the paddle on the ice, butterfly drop, glove and blocker saves
const G_BASE = { ...UPPER, root: { pitch: 18 * D, roll: 0, yaw: 0, lift: 0, x: 0, z: 0 }, spine: deg([6, 0, 0]), chest: deg([4, 0, 0]), neck: deg([-16, 0, 0]),
  hipR: deg([48, 22, -10]), knR: 76 * D, hipL: deg([48, 22, -10]), knL: 76 * D, flatR: true, flatL: true,
  shL: deg([40, 46, 0]), elL: 70 * D, shR: deg([30, 30, 0]), elR: 40 * D };
const gStance = (ph) => { const b = Math.sin(ph * Math.PI * 2) * 0.5 + 0.5; return withStick({ ...G_BASE, knR: (74 + 4 * b) * D, knL: (74 + 4 * b) * D }, { goalie: true, blade: [0.55, 'ice', -0.05] }); };
const gKeys = (key, blade) => keysWithStick([{ t: 0, ...G_BASE }, { t: 0.35, ...G_BASE, ...key }, { t: 0.8, ...G_BASE, ...key }, { t: 1, ...G_BASE }], blade, { goalie: true });
const G_BUTTERFLY = gKeys({ root: { pitch: 10 * D }, hipR: deg([80, 52, -40]), knR: 128 * D, hipL: deg([80, 52, -40]), knL: 128 * D, flatR: false, flatL: false },
  [{ t: 0, b: [0.55, 'ice', -0.05] }, { t: 1, b: [0.55, 'ice', -0.05] }]);
const G_GLOVE = gKeys({ chest: deg([4, -14, 0]), shL: deg([60, 110, 0]), elL: 30 * D, hipL: deg([40, 34, 0]), knL: 60 * D },
  [{ t: 0, b: [0.55, 'ice', -0.05] }, { t: 1, b: [0.55, 'ice', -0.05] }]);
const G_BLOCKER = gKeys({ chest: deg([4, 14, 0]), shR: deg([40, 100, 0]), elR: 20 * D, hipR: deg([40, 34, 0]), knR: 60 * D },
  [{ t: 0, b: [0.55, 'ice', -0.05] }, { t: 0.4, b: [0.4, 0.5, 0.9] }, { t: 1, b: [0.55, 'ice', -0.05] }]);

export const HOCKEY = {
  hSkate: { loop: true, dur: 0.62, frames: 12, fn: skate },
  hGlide: { loop: true, dur: 1.6, frames: 4, fn: glide },
  hShoot: { dur: 0.5, frames: 10, fn: SHOOT, release: 0.6 },
  hSlap: { dur: 0.95, frames: 14, fn: SLAP, release: 0.62 },
  hPass: { dur: 0.32, frames: 8, fn: PASS, release: 0.55 },
  hCheck: { dur: 0.5, frames: 8, fn: CHECK, hit: 0.45 },
  hBrake: { dur: 0.45, frames: 6, fn: BRAKE },
  hFall: { dur: 0.9, frames: 10, fn: FALL },
  gStance: { loop: true, dur: 1.8, frames: 4, fn: gStance },
  gButterfly: { dur: 0.55, frames: 8, fn: G_BUTTERFLY },
  gGlove: { dur: 0.45, frames: 6, fn: G_GLOVE },
  gBlocker: { dur: 0.45, frames: 6, fn: G_BLOCKER },
};
// Stick+IK solving is far too expensive to redo every physics frame, and the game
// asks for a pose by (action, phase) many times per frame. Memoise on a 1/240 phase
// grid: the same solved pose is reused by the bake, the sim's bladeOf and the lab.
for (const a of Object.values(HOCKEY)) {
  const raw = a.fn, memo = new Map();
  a.fn = (u) => {
    const q = a.loop ? Math.round((((u % 1) + 1) % 1) * 240) % 240 : Math.round(Math.min(1, Math.max(0, u)) * 240);
    let v = memo.get(q);
    if (!v) { v = raw(a.loop ? q / 240 : q / 240); memo.set(q, v); }
    return v;
  };
}
Object.assign(ACTIONS, HOCKEY);
export const HOCKEY_KEYS = Object.keys(HOCKEY);

/** Pose of an action at time t (seconds) or loop phase, with its stick, in FK body space. */
export function poseAt(name, t) {
  const a = HOCKEY[name];
  const u = a.loop ? (((t / a.dur) % 1) + 1) % 1 : Math.min(1, t / a.dur);
  const pose = a.fn(u);           // already carries the solved stick + IK'd arms
  const J = fk(pose);
  const st = pose._stick;
  const stick = st ? { ...st, T: st.butt, H: st.heel, E: st.toe, H0: st.heel, E0: st.toe } : st;
  return { J, stick, g: groundY(J), stickOk: pose._stickOk };
}
export { at as jointPoint };
