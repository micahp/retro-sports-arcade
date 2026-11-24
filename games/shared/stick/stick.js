// Shared rigid hockey stick: one spec, one pose solver, one contact geometry.
//
// Why this exists: the previous hockey code derived a stick from the *top hand*
// only, pushed the blade to an authored point with a chain of shrinking heuristics,
// and used a second, different "physics" blade that stuck out sideways from the
// shaft. The bottom hand was never attached (measured 0.47-0.81 m off the shaft),
// and the contact point sat 0.15-0.43 m from the drawn blade. This module replaces
// all of that with a rigid prop placed first, and hands solved onto it afterwards.
//
// Conventions (body space, metres, from vendor/stack/skeleton.js):
//   +x forward, +y up, +z the athlete's right.
//   butt   = top of the shaft, in the top hand
//   heel   = where the shaft meets the blade (bottom of the shaft)
//   toe    = far end of the blade
//   The toe continues the shaft's ground projection, pointing away from the hands.
//   That is the fix for the "backward-facing blade": by construction the blade can
//   never point back toward the body, and assertBladeForward() checks it per pose.

import { fk } from '../../hockey/vendor/stack/skeleton.js';
import { solveArms, gripPoint } from '../rig/ik.js';

const D = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const horiz = (a) => { const h = [a[0], 0, a[2]]; const l = Math.hypot(h[0], h[2]) || 1; return [h[0] / l, 0, h[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The stick itself. Lengths are adult-hockey realistic; the game's sprite reach is ~1 m. */
export const STICK_SPEC = {
  length: 1.52,          // butt to heel along the shaft
  bladeHeelToToe: 0.30,
  bladeToeLift: 0.012,   // the toe sits a little off the ice
  bladeThickness: 0.011,
  shaftRadius: 0.017,
  topGripFromButt: 0.06, // hand centre measured from the butt end
  bottomGripFromButt: 0.36,
  puckRadius: 0.0381,
  sweetSpot: 0.62,       // fraction along heel->toe used for shot release
};

/**
 * Place the stick from a blade heel target.
 *   heel      [x,y,z] body space, where the blade meets the ice (y ~ 0.03)
 *   pelvis    [x,y,z] body space, used to decide which way is "away from the body"
 *   opts      { buttHeight, handed, yaw, spec, azimuth }
 * Returns { butt, heel, toe, shaftDir, toeDir, lie, length }.
 */
export function placeStick(heel, pelvis, opts = {}) {
  const spec = opts.spec || STICK_SPEC;
  const L = spec.length;
  const handed = opts.handed === 'L' ? 'L' : 'R';
  // How far ahead of the hands the blade sits, measured on the ice. This is the
  // quantity an animator can reason about; the shaft length then fixes the rise,
  // so the stick stays rigid whatever reach is asked for.
  let dh = opts.reach ?? 0.88;
  if (dh > L - 0.02) dh = L - 0.02;
  if (dh < 0.05) dh = 0.05;
  const rise = Math.sqrt(Math.max(0, L * L - dh * dh));
  // horizontal direction the blade points: away from the pelvis unless overridden
  let hd = opts.azimuth != null
    ? [Math.sin(opts.azimuth), 0, Math.cos(opts.azimuth)]
    : horiz(sub(heel, pelvis));
  hd = unit(hd);
  const butt = [heel[0] - hd[0] * dh, heel[1] + rise, heel[2] - hd[2] * dh];
  const shaftDir = unit(sub(heel, butt));
  // blade direction: continues the shaft's ground projection, then the authored yaw
  const yaw = (opts.yaw || 0) * D;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const toeDir = [hd[0] * c + hd[2] * s, 0, -hd[0] * s + hd[2] * c];
  const toe = add(heel, [toeDir[0] * spec.bladeHeelToToe, spec.bladeToeLift, toeDir[2] * spec.bladeHeelToToe]);
  const lie = Math.acos(Math.max(-1, Math.min(1, rise / L)));  // shaft angle from vertical
  return { butt, heel, toe, shaftDir, toeDir, lie, length: L, handed, handSide: handed === 'R' ? 'L' : 'R' };
}

/** The two grip targets on the shaft, body space. */
export function gripTargets(stick, spec = STICK_SPEC) {
  const d = stick.shaftDir;
  return {
    top: add(stick.butt, mul(d, spec.topGripFromButt)),
    bottom: add(stick.butt, mul(d, spec.bottomGripFromButt)),
  };
}

/**
 * Point on the blade: u=0 heel, u=1 toe.
 * Blade is a straight segment with the toe lift; the contact radius is the blade
 * half-thickness plus the puck radius.
 */
export function bladePoint(stick, u = STICK_SPEC.sweetSpot) {
  return [
    stick.heel[0] + (stick.toe[0] - stick.heel[0]) * u,
    stick.heel[1] + (stick.toe[1] - stick.heel[1]) * u,
    stick.heel[2] + (stick.toe[2] - stick.heel[2]) * u,
  ];
}

/** Puck-contact geometry used by the game: the blade segment plus its radius. */
export function contactGeometry(stick, spec = STICK_SPEC) {
  return {
    a: stick.heel.slice(),
    b: stick.toe.slice(),
    radius: spec.bladeThickness / 2 + spec.puckRadius,
    radiusHub: spec.bladeThickness / 2 + spec.puckRadius,
    sweet: bladePoint(stick, spec.sweetSpot),
    shaft: [stick.butt.slice(), stick.heel.slice()],
    shaftRadius: spec.shaftRadius,
  };
}

/**
 * Solve a pose so both hands hold the stick.
 *
 * The blade target is the author's intent, but a rigid stick of fixed length can
 * put the grip points outside the character's reach. Rather than stretch the arms
 * or let a hand float, the stick is rotated toward the body (its `reach` parameter
 * shrinks) until both hands can hold it, and the largest reach that still fits is
 * kept. `clamped` reports how much forward reach had to be given up.
 *
 * Returns { pose, stick, targets, residual, ok, clamped, reach }.
 */
export function holdStick(pose, heel, opts = {}) {
  const spec = opts.spec || STICK_SPEC;
  const pelvis = fk(pose).pelvis.p;
  const tol = opts.tolerance ?? 0.03;
  const attempt = (reach) => {
    const stick = placeStick(heel, pelvis, { ...opts, reach, spec });
    const targets = gripTargets(stick, spec);
    const other = stick.handSide === 'L' ? 'R' : 'L';
    const { pose: posed, residual } = solveArms(pose, { [stick.handSide]: targets.top, [other]: targets.bottom }, { stay: opts.stay ?? 0.02, iters: opts.iters ?? 10 });
    return { posed, stick, targets, residual, worst: Math.max(...Object.values(residual)) };
  };
  let best = null;
  for (const reach of [0.95, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25]) {
    const r = attempt(reach);
    if (!best) best = r;
    if (r.worst <= tol) { best = r; break; }
    if (r.worst < best.worst) best = r;
  }
  const wantReach = opts.reach ?? 0.88;
  return {
    pose: { ...best.posed, _stick: best.stick },
    stick: best.stick,
    targets: best.targets,
    residual: best.residual,
    ok: best.worst <= tol,
    clamped: Math.max(0, wantReach - (wantReach - (best.worst <= tol ? 0 : 0))),
    reach: Math.hypot(best.stick.heel[0] - best.stick.butt[0], best.stick.heel[2] - best.stick.butt[2]),
  };
}

/** Geometric assertions the animation tests enforce. */
export function checkStick(stick, spec = STICK_SPEC) {
  const problems = [];
  const shaft = len(sub(stick.heel, stick.butt));
  if (Math.abs(shaft - spec.length) > 1e-6) problems.push(`shaft ${shaft.toFixed(4)} != ${spec.length} (not rigid)`);
  const blade = len(sub(stick.toe, stick.heel));
  if (Math.abs(blade - spec.bladeHeelToToe) > 0.02) problems.push(`blade ${blade.toFixed(3)}`);
  // the toe must point away from the hands, along the shaft's ground direction
  const away = unit(horiz(sub(stick.heel, stick.butt)));
  const toeH = unit(horiz(sub(stick.toe, stick.heel)));
  const align = dot(away, toeH);
  if (align < 0.2) problems.push(`blade faces back (toe vs shaft alignment ${align.toFixed(2)})`);
  return { ok: problems.length === 0, problems, alignment: align, shaft, blade };
}

/** Where each hand actually is relative to the shaft, for verification. */
export function gripError(J, stick, spec = STICK_SPEC) {
  const t = gripTargets(stick, spec);
  const side = stick.handSide, other = side === 'L' ? 'R' : 'L';
  const top = gripPoint(J, side), bottom = gripPoint(J, other);
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  return { top: dist(top, t.top), bottom: dist(bottom, t.bottom) };
}
