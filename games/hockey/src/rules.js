// Offside and icing, engine.rules = 'nhl95'. Behaviour follows the NHL 95 reference (penalty95.asm ChkOffsides,
// logic95.asm a2offsides and the icing check on a touch). Written from the behaviour, not copied.
//
// OFFSIDE (ChkOffsides, a2offsides). Three depths past the blue line, in NHL 95 units (3 per foot):
//   flag   the puck crosses the line into the zone while a skater of the attacking team is deeper than
//          line + 10 (3.3 ft): that team is flagged.
//   clear  every step, a flagged team is cleared once none of its skaters is deeper than line + 19 (6.3 ft):
//          a skater just inside the line counts as back. Until then the team cannot re-enter.
//   call   a touch by a skater of a flagged team calls offside only when the puck is at least line + 24
//          (8 ft) deep. A touch near the line or outside the zone does not.
// NHL 95's line is at 82 units (27.3 ft); Rink '95 draws its line at 25 ft (RINK.blueX). The rules measure from
// the drawn line, so there is no invisible line; the depths above are kept as tolerances relative to it.
// engine.offsideTol = 'none' and engine.offsideLine = 'ref82' reproduce the first version, for experiments.
//
// ICING. A skater releases the puck (shot or pass) from his own half. If the puck then crosses the far goal line
// untouched, icing is flagged. A non-goalie touch then calls icing against the team that iced it. A goalie touch
// cancels the flag. (Not yet modelled: NHL 95 clears icing when the puck goes into the crease.)
//
// TOUCHES come from the engine's rules-only touch record (pk.touchN, pk.toucher), set on every touch path:
// faceoff, shot, pass, hit, poke, deflection, tip, pickup and save.
import { RINK } from './config.js';
import { attackDir } from './helpers.js';

const UNIT = 0.3048 / 3;                 // one NHL 95 unit, in metres
export const OFFSIDE_TOL = { flag: 10 * UNIT, clear: 19 * UNIT, call: 24 * UNIT };

/** The offside geometry this game uses: the line and the three depths, in metres from centre. */
export function ruleGeometry(S) {
  const line = S.engine.offsideLine === 'ref82' ? 82 * UNIT : RINK.blueX;
  if (S.engine.offsideTol === 'none') return { line, flag: line, clear: line, call: -Infinity, aheadOfPuck: true };
  return { line, flag: line + OFFSIDE_TOL.flag, clear: line + OFFSIDE_TOL.clear, call: line + OFFSIDE_TOL.call, aheadOfPuck: false };
}

export function newRules() {
  return { off: [false, false], px: null, seq: null, owner: null, origin: null, iceFlag: null };
}

const onIce = (p) => !p.isG && !p.benched && !p.inBox && !p.retired;

// One step of the rules. Returns a whistle { kind, team } when a rule fires, else null.
export function rulesStep(S) {
  const R = S.rules, pk = S.puck, G = ruleGeometry(S);
  const touched = pk.toucher || null;
  const newTouch = !!touched && (pk.touchN || 0) !== R.seq;
  R.seq = pk.touchN || 0;

  // release: the puck leaves a skater's stick. Its origin decides whether a later crossing is icing.
  if (R.owner && !pk.owner) {
    const q = R.owner;
    R.origin = !q.isG && pk.x * attackDir(S, q.team) < 0 ? q.team : null;   // own half for that team
    R.iceFlag = null;
  }
  R.owner = pk.owner || null;

  // OFFSIDE: clear, then flag on entry
  for (let t = 0; t < 2; t++) {
    const d = attackDir(S, t);
    if (R.off[t] && !S.skaters.some((p) => p.team === t && onIce(p) && p.x * d > G.clear)) R.off[t] = false;
    if (R.px !== null && R.px * d <= G.line && pk.x * d > G.line && !R.off[t]) {
      if (S.skaters.some((p) => p.team === t && onIce(p) && p.x * d > G.flag && (!G.aheadOfPuck || p.x * d > pk.x * d))) R.off[t] = true;
    }
  }
  let fired = null;
  if (newTouch && !touched.isG && R.off[touched.team] && onIce(touched) && pk.x * attackDir(S, touched.team) >= G.call) {
    fired = { kind: 'offside', team: touched.team };
  }

  // ICING: flag on the far-line crossing, call on the next non-goalie touch
  if (newTouch && touched.isG) R.iceFlag = null;
  if (R.origin !== null && R.iceFlag === null && !pk.owner && !newTouch && pk.x * attackDir(S, R.origin) > RINK.goalX) {
    R.iceFlag = { team: R.origin };
  }
  if (!fired && newTouch && !touched.isG && R.iceFlag) fired = { kind: 'icing', team: R.iceFlag.team };

  R.px = pk.x;
  return fired;
}
