// Offside and icing, engine.rules = 'nhl95'. Behaviour follows the NHL 95 reference (penalty95.asm ChkOffsides;
// logic95.asm icing check on a touch). Written from the behaviour, not copied.
//
// OFFSIDE. A team's flag is set when the puck crosses that team's blue line while one of its skaters is already
// past the line and ahead of the puck. The flag stays set until all of the team's skaters are back behind the
// line, so the attacking team cannot re-enter with a player still in the zone. A touch by a skater of the
// flagged team then calls the whistle.
//
// ICING. A skater releases the puck (shot or pass) from his own half. If the puck then crosses the far goal line
// untouched, icing is flagged. A non-goalie touch then calls icing against the team that iced it. A goalie touch
// cancels the flag.
import { RINK } from './config.js';
import { attackDir } from './helpers.js';

// Blue line from the reference: 82 units from centre, 3 units per foot = 27.3 ft (Rink '95 uses 25 ft).
// Measured from the NHL 95 logs: the puck crosses at |y| 84-99 units, median 89, with the whistle about 0.3 s after.
export const RULE_BLUE = (82 / 3) * 0.3048;

export function newRules() {
  return { off: [false, false], px: null, seq: null, owner: null, origin: null, iceFlag: null };
}

const onIce = (p) => !p.isG && !p.benched && !p.inBox && !p.retired;

// One step of the rules. Returns a whistle { kind, team } when a rule fires, else null.
export function rulesStep(S) {
  const R = S.rules, pk = S.puck;
  // A new touch is a change in the engine's touch counter (passes, shots, tips, saves all bump it), or a pickup
  // (a new owner; pickups do not bump the counter). The same skater touching again is a new touch.
  const touched = pk.lastTouch;
  const newTouch = !!touched && (S.touch !== R.seq || (!!pk.owner && pk.owner !== R.owner));
  R.seq = S.touch;

  // release: the puck leaves a skater's stick. Its origin decides whether a later crossing is icing.
  if (R.owner && !pk.owner) {
    const q = R.owner;
    R.origin = !q.isG && pk.x * attackDir(S, q.team) < 0 ? q.team : null;   // own half for that team
    R.iceFlag = null;
  }
  R.owner = pk.owner || null;

  // OFFSIDE: flag on entry, clear when no skater of the team is past the line
  for (let t = 0; t < 2; t++) {
    const d = attackDir(S, t);
    const ahead = (p) => p.team === t && onIce(p) && p.x * d > RULE_BLUE;
    if (R.px !== null && R.px * d <= RULE_BLUE && pk.x * d > RULE_BLUE && !R.off[t]) {
      if (S.skaters.some((p) => ahead(p) && p.x * d > pk.x * d)) R.off[t] = true;
    }
    if (R.off[t] && !S.skaters.some(ahead)) R.off[t] = false;
  }
  let fired = null;
  if (newTouch && !touched.isG && R.off[touched.team] && onIce(touched)) fired = { kind: 'offside', team: touched.team };

  // ICING: flag on the far-line crossing, call on the next non-goalie touch
  if (newTouch && touched.isG) R.iceFlag = null;
  if (R.origin !== null && R.iceFlag === null && !pk.owner && !newTouch && pk.x * attackDir(S, R.origin) > RINK.goalX) {
    R.iceFlag = { team: R.origin };
  }
  if (!fired && newTouch && !touched.isG && R.iceFlag) fired = { kind: 'icing', team: R.iceFlag.team };

  R.px = pk.x;
  return fired;
}
