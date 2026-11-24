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
// (Since the render branch: the stick is no longer a baked part. It is drawn per frame in world space
// from stickOf, the same geometry the physics uses; see render.js.)
import { PARTS, PAL, sdRoundBox, BAKE } from '../vendor/stack/body.js';
import { ACTIONS } from '../vendor/stack/actions.js';
import { fk, D, sampleKeys, apply } from '../vendor/stack/skeleton.js';
// Bake footprint: with the stick drawn separately, only the body bakes. Falls stretch the arms past the
// vendor default (1.15 m: fall frames 7-9 clipped); 1.3 m clears every frame (tests/poses.test.mjs).
BAKE.half = 1.3;

const deg = (a) => a.map((x) => (typeof x === 'number' ? x * D : x));
const at = (J, n, c) => { const o = J[n].R, p = J[n].p; return [p[0] + o[0] * c[0] + o[1] * c[1] + o[2] * c[2], p[1] + o[3] * c[0] + o[4] * c[1] + o[5] * c[2], p[2] + o[6] * c[0] + o[7] * c[1] + o[8] * c[2]]; };
const SOLE = -0.125, BLADE_HALF = 0.15;
/** Lowest point of the skate blades in FK body space: where the ice is for this pose. */
export function groundY(J) {
  let y = 1e9;
  for (const a of ['anR', 'anL']) for (const x of [-BLADE_HALF + 0.05, BLADE_HALF + 0.05]) y = Math.min(y, at(J, a, [x, SOLE, 0])[1]);
  return y;
}

// Stick geometry per pose, in body space: top hand T, blade heel H, blade toe E, ice level g.
// THIS IS THE PHYSICS STICK: the sim's puck-contact point (bladeOf) is the midpoint of H and E, and
// the renderer draws exactly this geometry as a separate world-space mesh (render.js), so the drawn
// blade is where the physics blade is. It is not baked into the player sprite any more (the bake's
// +-1.15 m footprint cut the blade off). Known issue, left for a separate mechanics change: the blade
// is bent sideways off the shaft (a real stick is planar, blade continuing the shaft's line); fixing
// it moves the contact point, so it needs its own paired-seed experiment.
export function stickOf(J, s) {
  const T = at(J, 'wrL', [0.02, -0.07, 0]);
  const g = groundY(J);
  let B;
  if (s.blade === 'drop') {
    // dropped stick lies on the real floor (the lowest body point), not at skate height
    let floor = 1e9; for (const k in J) if (k[0] !== '_') floor = Math.min(floor, J[k].p[1] - 0.1);
    B = [T[0] + 0.9, floor + 0.02, T[2] + 0.7];
  }
  else B = [s.blade[0], g + (s.blade[1] === 'ice' ? 0.03 : s.blade[1]), s.blade[2]];
  // shaft length is fixed: slide the heel along the hand-to-target line
  const L = 1.5, d = [B[0] - T[0], B[1] - T[1], B[2] - T[2]], dl = Math.hypot(...d) || 1;
  const H = s.blade === 'drop' ? B : [T[0] + d[0] / dl * Math.min(L, dl), T[1] + d[1] / dl * Math.min(L, dl), T[2] + d[2] / dl * Math.min(L, dl)];
  const hx = d[0] / dl, hz = d[2] / dl, side = [hz, 0, -hx];
  const sl = Math.hypot(side[0], side[2]) || 1;
  const E = [H[0] - side[0] / sl * 0.3, H[1] + 0.01, H[2] - side[2] / sl * 0.3];
  return { T, H, E, g };
}

// skate blades under the boots
for (const an of ['anR', 'anL']) {
  PARTS.push({
    prio: 2, thin: true, joint: an, bounds: [[-0.14, -0.15, -0.03], [0.24, -0.06, 0.03]],
    sdf: (p) => sdRoundBox(p, [0.05, SOLE + 0.025, 0], [BLADE_HALF, 0.022, 0.007], 0.006),
    mat: () => PAL.MASK,
  });
}

/** Attach the stick for one pose and return the pose (called inside each action fn). */
function withStick(pose, s) { pose._stick = s; return pose; }

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
Object.assign(ACTIONS, HOCKEY);
export const HOCKEY_KEYS = Object.keys(HOCKEY);

/** Pose of an action at time t (seconds) or loop phase, with its stick, in FK body space. */
export function poseAt(name, t) {
  const a = HOCKEY[name];
  const u = a.loop ? (((t / a.dur) % 1) + 1) % 1 : Math.min(1, t / a.dur);
  const pose = a.fn(u);
  const J = fk(pose);
  return { J, stick: stickOf(J, pose._stick), g: groundY(J) };
}
export { at as jointPoint };
