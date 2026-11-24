// Two-bone limb IK shared by every sport in the arcade.
//
// Adapted from gridiron-physics web/mesh/ik.js (damped least squares over the arm
// chain, with a "stay" term so the solve adapts the authored pose instead of
// inventing a new one). That solver targets a palm on a contact point during a
// tackle; this one targets a grip point and is used by football, basketball and
// hockey alike, so it lives in games/shared/ rather than inside one sport.
//
// Body space: +x forward, +y up, +z the athlete's right, metres (vendor/stack/skeleton.js).
// A pose is per-joint angles in radians; fk() turns it into positions + rotations.

import { fk, D, fill } from '../../hockey/vendor/stack/skeleton.js';

const tw = (R, p, l) => [
  p[0] + R[0] * l[0] + R[1] * l[1] + R[2] * l[2],
  p[1] + R[3] * l[0] + R[4] * l[1] + R[5] * l[2],
  p[2] + R[6] * l[0] + R[7] * l[1] + R[8] * l[2],
];

// Joint limits, radians. Shoulder: flex (+ swings forward), abd (+ out), twist.
// Elbow: flex only. Chosen so the solve cannot hyper-extend or invert the arm.
export const LIMITS = {
  sh: [[-80 * D, 205 * D], [-35 * D, 145 * D], [-60 * D, 60 * D]],
  el: [[-8 * D, 160 * D]],
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Palm/grip centre: the shaft or handle passes through the middle of the fist. */
export function gripPoint(J, side) {
  const s = side === 'R' ? 1 : -1;
  const j = J['wr' + side];
  return tw(j.R, j.p, [0.004, -0.052, -s * 0.014]);
}

/**
 * Solve one arm so its grip point reaches `target` (body space).
 * opts: { stay, iters, seed }  stay = how hard the solve holds the authored angles.
 * Returns { pose, residual, angles } — residual is metres, and a caller must treat
 * anything above its tolerance as "this target is not reachable".
 */
export function solveArmToPoint(pose, side, target, opts = {}) {
  const sh = 'sh' + side, el = 'el' + side;
  const P = fill(pose);
  const stay = opts.stay ?? 0.004;
  const iters = opts.iters ?? 12;
  const x0 = [...P[sh], P[el]];
  let x = x0.slice();
  // Analytic seed: close the 2-bone chain by the law of cosines, then point the
  // shoulder at the target. The damped solve only has to tidy up from here.
  {
    const J0 = fk(P);
    const shP = J0[sh].p;
    const v = [target[0] - shP[0], target[1] - shP[1], target[2] - shP[2]];
    const d = Math.hypot(v[0], v[1], v[2]) || 1e-6;
    const l1 = 0.29, l2 = 0.26;
    const dc = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-3, d));
    const cosE = (l1 * l1 + l2 * l2 - dc * dc) / (2 * l1 * l2);
    const e = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosE)));
    const sideSign = side === 'R' ? 1 : -1;
    const flex = Math.atan2(v[0], -v[1]);
    const abd = -sideSign * Math.atan2(v[2], Math.hypot(v[0], v[1]));
    x = [flex, abd, 0, e];
  }

  const residuals = (y) => {
    const J = fk({ ...P, [sh]: y.slice(0, 3), [el]: y[3] });
    const p = gripPoint(J, side);
    const r = [p[0] - target[0], p[1] - target[1], p[2] - target[2]];
    for (let k = 0; k < 4; k++) r.push(stay * (y[k] - x0[k]));
    return r;
  };
  const err = (r) => r.reduce((s, v) => s + v * v, 0);

  for (let it = 0; it < iters; it++) {
    const r0 = residuals(x);
    if (Math.sqrt(r0[0] ** 2 + r0[1] ** 2 + r0[2] ** 2) < 1e-4) break;
    // numeric Jacobian, 4 params x 5 residuals
    const h = 1e-4, Jm = [];
    for (let k = 0; k < 4; k++) {
      const y = x.slice(); y[k] += h;
      const r1 = residuals(y);
      Jm.push(r1.map((v, i) => (v - r0[i]) / h));
    }
    // normal equations: (J^T J + lambda I) dx = -J^T r
    const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    const b = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < r0.length; k++) s += Jm[i][k] * Jm[j][k];
        A[i][j] = s;
      }
      let s = 0;
      for (let k = 0; k < r0.length; k++) s += Jm[i][k] * r0[k];
      b[i] = -s;
    }
    const lambda = 1e-3;
    for (let i = 0; i < 4; i++) A[i][i] += lambda;
    const dx = solve4(A, b);
    if (!dx) break;
    let step = 1;
    const before = err(r0);
    for (let tries = 0; tries < 6; tries++) {
      const y = x.map((v, i) => v + dx[i] * step);
      // clamp to the joint limits
      for (let k = 0; k < 3; k++) y[k] = clamp(y[k], LIMITS.sh[k][0], LIMITS.sh[k][1]);
      y[3] = clamp(y[3], LIMITS.el[0][0], LIMITS.el[0][1]);
      if (err(residuals(y)) < before) { x = y; break; }
      step *= 0.5;
      if (tries === 5) { x = y; }
    }
  }
  const r = residuals(x);
  return {
    pose: { ...P, [sh]: x.slice(0, 3), [el]: x[3] },
    residual: Math.hypot(r[0], r[1], r[2]),
    angles: x,
  };
}

/** Solve both arms to two targets. Returns pose + per-side residual. */
export function solveArms(pose, targets, opts = {}) {
  let out = pose;
  const residual = {};
  for (const side of ['R', 'L']) {
    if (!targets[side]) continue;
    const r = solveArmToPoint(out, side, targets[side], opts);
    out = r.pose;
    residual[side] = r.residual;
  }
  return { pose: out, residual };
}

// 4x4 Gaussian elimination with partial pivoting.
function solve4(A, b) {
  const n = 4, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [0, 1, 2, 3].map((i) => M[i][n] / M[i][i]);
}
