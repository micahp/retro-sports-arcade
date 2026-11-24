// Offside and icing (engine.rules = 'nhl95'). Scenario tests on constructed positions, plus a full game.
import { createGame, step } from '../src/sim.js';
import { rulesStep, RULE_BLUE } from '../src/rules.js';
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++; };
// Period 1: team 0 attacks +x. Every skater starts back in its own zone; the test places the ones it needs.
function fresh() {
  const S = createGame('regulation', 'rules-t', { auto: true, penalties: false, engine: { rules: 'nhl95' } });
  S.phase = 'play';
  for (const p of S.skaters) { p.benched = false; p.inBox = false; p.retired = false; p.x = -5; p.z = 0; }
  S.rules.px = -5; S.puck.x = -5;
  return S;
}
const att = (S) => S.skaters.find((p) => p.team === 0 && !p.isG);
const def = (S) => S.skaters.find((p) => p.team === 1 && !p.isG);
const gk1 = (S) => S.skaters.find((p) => p.team === 1 && p.isG);
const cross = (S, from, to) => { S.rules.px = from; S.puck.x = to; return rulesStep(S); };

{ // A. offside: the puck crosses the blue line with an attacker already ahead; a touch by him calls it
  const S = fresh(), a = att(S);
  a.x = 9.0; S.puck.lastTouch = null;
  const r1 = cross(S, 8.0, 8.6);
  check(S.rules.off[0] === true && r1 === null, 'A: puck crosses the line with an attacker ahead: team 0 flagged, no whistle yet');
  S.puck.lastTouch = a;
  const r2 = rulesStep(S);
  check(r2 && r2.kind === 'offside' && r2.team === 0, 'A: touch by the flagged attacker calls offside against team 0');
}
{ // B. re-entry: the attacker stays in the zone while the puck goes out and back in: still offside
  const S = fresh(), a = att(S);
  a.x = 9.0; S.puck.lastTouch = null;
  cross(S, 8.0, 8.6);
  cross(S, 8.6, 6.0);                      // puck out, attacker still ahead
  check(S.rules.off[0] === true, 'B: puck leaves the zone with an attacker still in: flag stays set');
  cross(S, 6.0, 8.6);                      // puck back in
  S.puck.lastTouch = a;
  const r = rulesStep(S);
  check(r && r.kind === 'offside', 'B: puck re-enters with the attacker still in the zone, touch calls offside');
}
{ // C. re-entry after everyone is back: the flag clears when the attackers are behind the line
  const S = fresh(), a = att(S);
  a.x = 9.0; S.puck.lastTouch = null;
  cross(S, 8.0, 8.6);
  a.x = 5.0;                               // attacker back behind the line
  cross(S, 8.6, 6.0);
  check(S.rules.off[0] === false, 'C: all attackers back behind the line: flag cleared');
  a.x = 5.0; cross(S, 6.0, 8.6);           // puck re-enters with nobody ahead
  check(S.rules.off[0] === false, 'C: puck re-enters with nobody ahead: no flag');
  S.puck.lastTouch = a;
  check(rulesStep(S) === null, 'C: a later touch is not offside');
}
{ // D. the touching team is not flagged: a defender touching the puck in the zone is not offside
  const S = fresh(), a = att(S), dd = def(S);
  a.x = 9.0; cross(S, 8.0, 8.6);
  S.puck.lastTouch = dd; dd.x = 9.5;
  check(rulesStep(S) === null, 'D: a defender touch while team 0 is flagged is not offside');
}
{ // E. icing: shot from own half, far line crossed untouched, then a non-goalie touch calls it
  const S = fresh(), sh = att(S), q = def(S);
  sh.x = -10; S.puck.owner = sh; rulesStep(S);
  S.puck.owner = null; S.puck.x = -10; S.puck.lastTouch = sh;
  rulesStep(S);                             // the release (the shooter's own touch) must not call icing
  S.rules.px = -10; S.puck.x = 28;          // crosses the far goal line (27.1 m), no touch
  rulesStep(S);
  check(S.rules.iceFlag && S.rules.iceFlag.team === 0, 'E: untouched crossing of the far line flags icing for team 0');
  S.puck.lastTouch = q;
  const r = rulesStep(S);
  check(r && r.kind === 'icing' && r.team === 0, 'E: a non-goalie touch then calls icing against team 0');
}
{ // F. a goalie touch cancels icing
  const S = fresh(), sh = att(S), q = def(S), g = gk1(S);
  sh.x = -10; S.puck.owner = sh; rulesStep(S);
  S.puck.owner = null; S.puck.x = -10; S.puck.lastTouch = sh; rulesStep(S);
  S.rules.px = -10; S.puck.x = 28; rulesStep(S);
  S.puck.lastTouch = g;
  check(rulesStep(S) === null && S.rules.iceFlag === null, 'F: a goalie touch cancels the icing flag');
  S.puck.lastTouch = q;
  check(rulesStep(S) === null, 'F: a later skater touch does not call icing');
}
{ // G. no icing from the neutral zone: the release was not from the shooter's own half
  const S = fresh(), sh = att(S), q = def(S);
  sh.x = 10; S.puck.owner = sh; rulesStep(S);
  S.puck.owner = null; S.puck.x = 10; S.puck.lastTouch = sh; rulesStep(S);
  S.rules.px = 10; S.puck.x = 28; rulesStep(S);
  S.puck.lastTouch = q;
  check(rulesStep(S) === null, 'G: release from the attacking half: no icing');
}
{ // H. the blue line: 27.3 ft (82 units), not the 25 ft Rink '95 uses
  check(Math.abs(RULE_BLUE / 0.3048 - 27.33) < 0.01, `H: rule blue line ${(RULE_BLUE / 0.3048).toFixed(2)} ft (reference 82 units = 27.3 ft)`);
}
{ // I. default engine: no rules state, no rule events
  const S = createGame('regulation', 'rules-d', { auto: true, penalties: false });
  check(S.rules === null, 'I: the default engine has no rules state');
}
{ // J. a full game under the rules: runs to the end, counts the whistles
  const S = createGame('regulation', 'rules-game', { auto: true, penalties: false, engine: { rules: 'nhl95' } });
  for (let i = 0; i < 60 * 60 * 40 && S.phase !== 'final'; i++) step(S, {});
  const n = (k) => S.log.filter((e) => e.type === k).length;
  check(S.phase === 'final', `J: a full game under nhl95 rules runs to the end (score ${S.score.join('-')}, offside ${n('offside')}, icing ${n('icing')})`);
}
console.log(fail ? `${fail} rules check(s) failed` : 'all rules checks pass');
process.exitCode = fail ? 1 : 0;
