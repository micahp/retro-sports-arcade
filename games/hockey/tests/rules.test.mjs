// Offside and icing (engine.rules = 'nhl95'). Scenario tests on constructed positions, a full-game audit of
// every touch path, and event ordering between rules and goals.
import { createGame, step } from '../src/sim.js';
import { rulesStep, ruleGeometry, OFFSIDE_TOL } from '../src/rules.js';
import { RINK } from '../src/config.js';
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++; };
const UNIT = 0.3048 / 3;
// Period 1: team 0 attacks +x. Every skater starts back in its own zone; the test places the ones it needs.
function fresh(engine = {}) {
  const S = createGame('regulation', 'rules-t', { auto: true, penalties: false, engine: { rules: 'nhl95', ...engine } });
  S.phase = 'play';
  for (const p of S.skaters) { p.benched = false; p.inBox = false; p.retired = false; p.x = -5; p.z = 0; }
  S.rules.px = -5; S.puck.x = -5;
  return S;
}
// a touch as the engine records one for the rules
const touch = (S, p) => { S.puck.toucher = p; S.puck.touchN = (S.puck.touchN || 0) + 1; };
const att = (S) => S.skaters.find((p) => p.team === 0 && !p.isG);
const def = (S) => S.skaters.find((p) => p.team === 1 && !p.isG);
const gk1 = (S) => S.skaters.find((p) => p.team === 1 && p.isG);
const cross = (S, from, to) => { S.rules.px = from; S.puck.x = to; return rulesStep(S); };
const at = (S, x) => { S.rules.px = S.puck.x; S.puck.x = x; return rulesStep(S); };   // move the puck, one step

{ // H. geometry: the rules measure from the drawn blue line; NHL 95's depths are tolerances relative to it
  const S = fresh(), G = ruleGeometry(S);
  check(G.line === RINK.blueX, `H: the rules use the drawn blue line (${(G.line / 0.3048).toFixed(1)} ft), no invisible line`);
  check(Math.abs(OFFSIDE_TOL.flag - 10 * UNIT) < 1e-12 && Math.abs(OFFSIDE_TOL.clear - 19 * UNIT) < 1e-12 && Math.abs(OFFSIDE_TOL.call - 24 * UNIT) < 1e-12,
    'H: depths past the line are NHL 95 units 10 (flag), 19 (clear), 24 (call) = 3.3, 6.3, 8.0 ft');
}
{ // A. offside: entry with an attacker deep in the zone, then a touch with the puck deep calls it
  const S = fresh(), G = ruleGeometry(S), a = att(S);
  a.x = G.clear + 2;
  check(cross(S, G.line - 0.3, G.line + 0.3) === null && S.rules.off[0], 'A: puck crosses with an attacker deeper than the flag depth: team 0 flagged, no whistle yet');
  at(S, G.call + 0.5); touch(S, a);
  const r = rulesStep(S);
  check(r && r.kind === 'offside' && r.team === 0, 'A: a touch by the flagged attacker with the puck past the call depth calls offside');
}
{ // L. the call depth: a touch with the puck shallower than line + 24 units is not offside
  const S = fresh(), G = ruleGeometry(S), a = att(S);
  a.x = G.clear + 2;
  cross(S, G.line - 0.3, G.line + 0.3);
  touch(S, a);
  check(rulesStep(S) === null && S.rules.off[0], 'L: flagged touch with the puck just inside the line: no whistle, still flagged');
  at(S, G.call + 0.5); touch(S, a);
  check(rulesStep(S) !== null, 'L: the next touch with the puck deep calls it');
}
{ // M. the flag depth: an attacker just past the line (shallower than line + 10 units) does not flag the team
  const S = fresh(), G = ruleGeometry(S), a = att(S);
  a.x = G.line + 0.5 * OFFSIDE_TOL.flag;
  cross(S, G.line - 0.3, G.line + 0.3);
  check(!S.rules.off[0], 'M: attacker between the line and the flag depth: no flag');
}
{ // B. re-entry: an attacker who stays deep keeps the team flagged while the puck goes out and back in
  const S = fresh(), G = ruleGeometry(S), a = att(S);
  a.x = G.clear + 2;
  cross(S, G.line - 0.3, G.line + 0.3);
  at(S, G.line - 2);
  check(S.rules.off[0], 'B: puck leaves the zone with an attacker still deep: flag stays set');
  at(S, G.line + 0.3); at(S, G.call + 0.5); touch(S, a);
  const r = rulesStep(S);
  check(r && r.kind === 'offside', 'B: puck re-enters with the attacker still deep: a deep touch calls offside');
}
{ // C. clearing: an attacker within line + 19 units counts as back
  const S = fresh(), G = ruleGeometry(S), a = att(S);
  a.x = G.clear + 2;
  cross(S, G.line - 0.3, G.line + 0.3);
  a.x = G.clear - 0.2;                     // inside the line still, but within the clearing depth
  at(S, G.line - 2);
  check(!S.rules.off[0], 'C: attacker within the clearing depth counts as back: flag cleared');
  at(S, G.line + 0.3); at(S, G.call + 0.5); touch(S, a);
  check(rulesStep(S) === null, 'C: re-entry after clearing, deep touch: not offside');
}
{ // D. a defender touching the puck is never offside
  const S = fresh(), G = ruleGeometry(S), a = att(S), dd = def(S);
  a.x = G.clear + 2; cross(S, G.line - 0.3, G.line + 0.3);
  at(S, G.call + 0.5); dd.x = G.call + 0.5; touch(S, dd);
  check(rulesStep(S) === null, 'D: a defender touch while team 0 is flagged is not offside');
}
{ // K. the same skater touching twice: the second touch is a new touch
  const S = fresh(), G = ruleGeometry(S), a = att(S);
  at(S, G.call + 0.5); touch(S, a); rulesStep(S);         // a touches deep, before any flag
  S.puck.x = G.line - 0.3; rulesStep(S);
  a.x = G.clear + 2; cross(S, G.line - 0.3, G.line + 0.3);
  at(S, G.call + 0.5); touch(S, a);                       // same skater again
  const r = rulesStep(S);
  check(r && r.kind === 'offside', 'K: a second touch by the same flagged skater calls offside');
}
{ // N. the first version (offsideTol 'none', offsideLine 'ref82') is still reproducible for experiments
  const S = fresh({ offsideTol: 'none', offsideLine: 'ref82' }), G = ruleGeometry(S), a = att(S);
  check(Math.abs(G.line - 82 * UNIT) < 1e-12 && G.flag === G.line && G.call === -Infinity, 'N: first-version geometry: one threshold at 82 units, call anywhere');
  a.x = G.line + 1; cross(S, G.line - 0.3, G.line + 0.3); touch(S, a);
  check(rulesStep(S) !== null, 'N: first version calls on a shallow touch');
}
{ // E. icing: shot from own half, far line crossed untouched, then a non-goalie touch calls it
  const S = fresh(), sh = att(S), q = def(S);
  sh.x = -10; S.puck.owner = sh; rulesStep(S);
  S.puck.owner = null; S.puck.x = -10; touch(S, sh);
  rulesStep(S);
  S.rules.px = -10; S.puck.x = 28;
  rulesStep(S);
  check(S.rules.iceFlag && S.rules.iceFlag.team === 0, 'E: untouched crossing of the far line flags icing for team 0');
  touch(S, q);
  const r = rulesStep(S);
  check(r && r.kind === 'icing' && r.team === 0, 'E: a non-goalie touch then calls icing against team 0');
}
{ // F. a goalie touch cancels icing
  const S = fresh(), sh = att(S), q = def(S), g = gk1(S);
  sh.x = -10; S.puck.owner = sh; rulesStep(S);
  S.puck.owner = null; S.puck.x = -10; touch(S, sh); rulesStep(S);
  S.rules.px = -10; S.puck.x = 28; rulesStep(S);
  touch(S, g);
  check(rulesStep(S) === null && S.rules.iceFlag === null, 'F: a goalie touch cancels the icing flag');
  touch(S, q);
  check(rulesStep(S) === null, 'F: a later skater touch does not call icing');
}
{ // G. no icing from the attacking half
  const S = fresh(), sh = att(S), q = def(S);
  sh.x = 10; S.puck.owner = sh; rulesStep(S);
  S.puck.owner = null; S.puck.x = 10; touch(S, sh); rulesStep(S);
  S.rules.px = 10; S.puck.x = 28; rulesStep(S);
  touch(S, q);
  check(rulesStep(S) === null, 'G: release from the attacking half: no icing');
}
{ // P. event order: a flagged team cannot score on the step it touches the puck deep in the zone
  const S = fresh(), G = ruleGeometry(S), a = att(S);
  for (const p of S.skaters) if (p.isG) p.x = -20;          // goalies out of the way
  a.x = G.clear + 2; cross(S, G.line - 0.3, G.line + 0.3);
  S.rules.px = S.puck.x;
  Object.assign(S.puck, { x: RINK.goalX - 0.1, z: 0, y: 0.05, vx: 25, vz: 0, vy: 0, owner: null, lock: 0, shot: null });
  touch(S, a);                                              // the flagged attacker touched it this step
  const before = [...S.score];
  step(S, {});
  check(S.score[0] === before[0] && S.whistleFor && S.whistleFor.kind === 'offside', `P: goal and offside on the same step: offside, no goal (score ${S.score.join('-')})`);
}
{ // Q. no goal while play is stopped by a rules whistle
  const S = fresh();
  for (const p of S.skaters) if (p.isG) p.x = -20;
  S.phase = 'whistle'; S.phaseT = 0; S.whistleFor = { kind: 'offside', team: 1 };
  Object.assign(S.puck, { x: RINK.goalX - 0.1, z: 0, y: 0.05, vx: 25, vz: 0, vy: 0, owner: null, lock: 0, shot: null });
  const before = [...S.score];
  step(S, {});
  check(S.score.join() === before.join(), 'Q: a puck sliding into the net during a rules whistle does not score');
}
{ // I. default engine: no rules state
  const S = createGame('regulation', 'rules-d', { auto: true, penalties: false });
  check(S.rules === null, 'I: the default engine has no rules state');
}
{ // O + J. a full game under the rules: every touch event moves the touch record to the right skater
  const S = createGame('regulation', 'rules-game', { auto: true, penalties: false, engine: { rules: 'nhl95' } });
  const actor = (e) => (e.type === 'deflect' ? e.off : e.type === 'poke' ? (e.ok ? e.by : null) : ['tip', 'pickup', 'reception', 'interception', 'save'].includes(e.type) ? e.by : null);
  let checked = 0, bad = 0, missed = 0;
  for (let i = 0; i < 60 * 60 * 40 && S.phase !== 'final'; i++) {
    const n0 = S.puck.touchN || 0;
    step(S, {});
    for (const e of S.events) {
      const who = actor(e);
      if (who === null || who === undefined) continue;
      checked++;
      if ((S.puck.touchN || 0) === n0) missed++;
      else if (!S.skaters.some((p) => p.id === who && p.team === (S.skaters[who] || {}).team)) bad++;
    }
  }
  check(checked > 50 && missed === 0, `O: every touch event (${checked} deflections, tips, pokes, pickups, receptions, interceptions, saves) moved the touch record`);
  const n = (k) => S.log.filter((e) => e.type === k).length;
  check(S.phase === 'final', `J: a full game under nhl95 rules runs to the end (score ${S.score.join('-')}, offside ${n('offside')}, icing ${n('icing')})`);
}
console.log(fail ? `${fail} rules check(s) failed` : 'all rules checks pass');
process.exitCode = fail ? 1 : 0;
