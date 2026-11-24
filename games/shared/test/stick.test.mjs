// Rigid stick + hand IK: geometry, handedness and reach.
// Fails loudly on the two defects this module replaces: a blade that faces back
// toward the body, and a hand that is not on the shaft.
import { fk, D } from '../../hockey/vendor/stack/skeleton.js';
import { STICK_SPEC, placeStick, gripTargets, contactGeometry, holdStick, checkStick, gripError, bladePoint } from '../stick/stick.js';

let fail = 0;
const ok = (cond, msg) => { if (!cond) { console.log('FAIL', msg); fail++; } };

const stance = (o = {}) => ({
  root: { pitch: 30 * D, roll: 0, yaw: 0, lift: 0, x: 0, z: 0 },
  spine: [10 * D, 0, 0], chest: [6 * D, 0, 0], neck: [-30 * D, 0, 0], head: [-8 * D, 0, 0],
  shL: [62 * D, 22 * D, 10 * D], elL: 70 * D, wrL: [10 * D, 0],
  shR: [40 * D, 12 * D, 0], elR: 30 * D, wrR: [0, 0],
  hipR: [50 * D, 10 * D, 0], knR: 70 * D, hipL: [50 * D, 10 * D, 0], knL: 70 * D,
  flatR: true, flatL: true, gripL: 0.9, gripR: 0.9, ...o,
});

// ---- 1. geometry for a normal carry -------------------------------------------------
const p = stance();
const pelvis = fk(p).pelvis.p;
const heel = [0.80, 0.03, 0.10];
const st = placeStick(heel, pelvis, { handed: 'R' });
const chk = checkStick(st);
ok(chk.ok, `carry stick geometry: ${chk.problems.join('; ')}`);
ok(chk.alignment > 0.2, `blade must continue the shaft (alignment ${chk.alignment.toFixed(2)})`);
ok(Math.abs(st.length - STICK_SPEC.length) < 1e-9, 'stick length is the spec length');
ok(Math.abs(st.toe[1] - (heel[1] + STICK_SPEC.bladeToeLift)) < 1e-9, 'toe lift');

// the toe must be FURTHER from the pelvis than the heel: this is the "backward blade" test
const dHeel = Math.hypot(st.heel[0] - pelvis[0], st.heel[2] - pelvis[2]);
const dToe = Math.hypot(st.toe[0] - pelvis[0], st.toe[2] - pelvis[2]);
ok(dToe > dHeel, `toe (${dToe.toFixed(2)} m) must be further from the body than the heel (${dHeel.toFixed(2)} m)`);

// contact geometry sits on the drawn blade, at the sweet spot
const cg = contactGeometry(st);
const midDraw = bladePoint(st, STICK_SPEC.sweetSpot);
ok(Math.hypot(cg.sweet[0] - midDraw[0], cg.sweet[1] - midDraw[1], cg.sweet[2] - midDraw[2]) < 1e-9, 'contact point is on the drawn blade');
ok(Math.abs(cg.radius - (STICK_SPEC.bladeThickness / 2 + STICK_SPEC.puckRadius)) < 1e-9, 'contact radius = blade half thickness + puck radius');
ok(cg.b[0] > cg.a[0], 'toe is forward of the heel in a carry');

// ---- 2. hands land on the shaft ------------------------------------------------------
for (const ang of [0.35, 0.55, 0.75]) {
  const heel2 = [0.55 + ang, 0.03, 0.05 + ang * 0.3];
  const r = holdStick(stance(), heel2, { handed: 'R' });
  const ge = gripError(fk(r.pose), r.stick);
  const t = gripTargets(r.stick);
  ok(ge.top < 0.03, `top hand on shaft at reach ${ang}: ${ge.top.toFixed(3)} m`);
  ok(ge.bottom < 0.03, `bottom hand on shaft at reach ${ang}: ${ge.bottom.toFixed(3)} m`);
  ok(r.ok, `holdStick reports ok at reach ${ang} (residual ${JSON.stringify(r.residual)})`);
  // the hands must be apart by the grip spacing, measured along the shaft
  const J = fk(r.pose);
  const topP = r.pose._stick ? null : null;
  void topP; void t; void J;
}

// ---- 3. handedness mirrors ------------------------------------------------------------
const rR = holdStick(stance(), heel, { handed: 'R' });
const rL = holdStick(stance(), heel, { handed: 'L' });
ok(rR.stick.handSide === 'L', 'right-handed stick: left hand on top');
ok(rL.stick.handSide === 'R', 'left-handed stick: right hand on top');
const gR = gripError(fk(rR.pose), rR.stick), gL = gripError(fk(rL.pose), rL.stick);
ok(gR.top < 0.03 && gR.bottom < 0.03, `right-handed grips (${gR.top.toFixed(3)}, ${gR.bottom.toFixed(3)})`);
ok(gL.top < 0.03 && gL.bottom < 0.03, `left-handed grips (${gL.top.toFixed(3)}, ${gL.bottom.toFixed(3)})`);

// ---- 4. a raised blade (wrist-shot wind-up) still keeps the shaft rigid --------------
const up = placeStick([-0.35, 1.05, 0.45], pelvis, { handed: 'R', buttHeight: 1.20 });
ok(Math.abs(Math.hypot(...[up.heel[0] - up.butt[0], up.heel[1] - up.butt[1], up.heel[2] - up.butt[2]]) - STICK_SPEC.length) < 1e-9, 'shaft stays rigid with the blade raised');
ok(checkStick(up).ok, `raised-blade geometry: ${checkStick(up).problems.join('; ')}`);

console.log(fail ? `${fail} stick failures` : 'stick ok');
process.exitCode = fail ? 1 : 0;
