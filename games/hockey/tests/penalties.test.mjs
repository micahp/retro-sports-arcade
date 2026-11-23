// Penalty rules: who goes off, for how long, what ends it, and how goals are tagged.
import { createGame, step, callPenalty, penaltySeconds, strengthOf, attackDir, DT } from '../src/sim.js';
import { RINK } from '../src/config.js';
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++; };
const live = (opts = {}) => { const S = createGame('regulation', 'pen', { auto: true, ...opts }); for (let i = 0; i < 70; i++) step(S, {}); return S; };
const run = (S, sec) => { for (let i = 0; i < sec / DT; i++) step(S, {}); };
const skater = (S, team, role) => S.skaters.find((p) => p.team === team && p.role === role);

{ // a minor: 5 on 4, offender in the box, faceoff in the offending team's end
  const S = live(); const p = skater(S, 1, 'LD');
  const called = callPenalty(S, p, 'hooking');
  check(called && p.benched && p.inBox && S.manpower[0] === 5 && S.manpower[1] === 4, `minor called: ${S.manpower.join(' on ')}, offender in the box: ${p.inBox}`);
  run(S, 1.6);
  const side = -attackDir(S, 1);
  check(S.phase === 'faceoff' && Math.sign(S.faceSpot.x) === side && Math.abs(Math.abs(S.faceSpot.x) - RINK.dotX) < 0.01, `faceoff at ${S.faceSpot.x.toFixed(1)}, ${S.faceSpot.z.toFixed(1)} in the offending team's end`);
  check(Math.abs(penaltySeconds(S) - 18) < 1e-9, `minor length scales with a 3-minute period: ${penaltySeconds(S)} s`);
}
{ // it expires after its time of live play and the player comes back
  const S = live(); const p = skater(S, 1, 'LW'); callPenalty(S, p, 'interference');
  let back = null;
  for (let i = 0; i < 60 / DT && back == null; i++) { step(S, {}); if (!p.inBox && S.log.some((e) => e.type === 'penaltyEnd')) back = S.log.find((e) => e.type === 'penaltyEnd'); }
  const served = S.log.filter((e) => e.type === 'penaltyEnd').length === 1 && back && back.why;
  check(back && (back.why === 'expired' || back.why === 'ppGoal') && S.manpower[1] === 5, `penalty ended (${served}), back to ${S.manpower.join(' on ')}`);
}
{ // a power-play goal ends the minor early and is tagged PP
  const S = live(); callPenalty(S, skater(S, 1, 'C'), 'hooking'); run(S, 1.6);
  for (let i = 0; i < 200 && S.phase !== 'play'; i++) step(S, {});
  const d = attackDir(S, 0);
  Object.assign(S.puck, { owner: null, x: d * (RINK.goalX - 2), z: 0.1, vx: d * 25, vz: 0, vy: 0.3, y: 0, shot: null, lock: 0 });
  const g = S.skaters.find((q) => q.isG && q.team === 1); g.z = 5;      // move the goalie out of the way
  run(S, 0.5);
  const goal = S.log.filter((e) => e.type === 'goal').at(-1), end = S.log.find((e) => e.type === 'penaltyEnd');
  check(goal && goal.strength === 'PP' && end && end.why === 'ppGoal' && S.manpower[1] === 5, `goal tagged ${goal && goal.strength}; minor ended by ${end && end.why}; now ${S.manpower.join(' on ')}`);
}
{ // two in the box: 5 on 3; a third waits and the team never drops below three
  const S = live(); callPenalty(S, skater(S, 1, 'LD'), 'hooking'); S.phase = 'play';
  callPenalty(S, skater(S, 1, 'RD'), 'charging'); S.phase = 'play';
  check(S.manpower[1] === 3, `two penalties: ${S.manpower.join(' on ')}`);
  callPenalty(S, skater(S, 1, 'RW'), 'boarding');
  const pend = S.box.filter((b) => b.pending).length;
  check(S.manpower[1] === 3 && pend === 1, `third penalty waits (${pend} pending), still ${S.manpower.join(' on ')}`);
  check(strengthOf(S, 0) === 'PP' && strengthOf(S, 1) === 'SH', `strength: Harbor ${strengthOf(S, 0)}, Foundry ${strengthOf(S, 1)}`);
}
{ // 3-on-3 overtime: a penalty makes it 4 on 3 (never 2 on 3), and it goes back to 3 on 3 when it ends
  let seen = false, restored = false;
  for (let k = 0; k < 15 && !restored; k++) {
    const S = createGame('ot3', 'ot-pen-' + k, { auto: true, penalties: true }); for (let i = 0; i < 70; i++) step(S, {});
    callPenalty(S, skater(S, 1, 'C'), 'hooking');
    if (S.manpower[0] === 4 && S.manpower[1] === 3) seen = true;
    for (let i = 0; i < 60 / DT && S.box.length && S.phase !== 'final'; i++) step(S, {});
    if (!S.box.length && S.phase !== 'final' && S.manpower[0] === 3 && S.manpower[1] === 3) restored = true;
  }
  check(seen, 'overtime penalty makes it 4 on 3');
  check(restored, 'when it expires, back to 3 on 3 (extra skater and substitute leave)');
}
{ // penalties off: nothing is ever called
  const S = live({ penalties: false });
  check(!callPenalty(S, skater(S, 1, 'LD'), 'hooking') && S.manpower[1] === 5, 'penalties off: no call');
}
{ // full games with penalties: calls happen, the box always empties, nobody plays below three
  let calls = 0, minMan = 9, open = 0, bad = 0, unexplained = 0;
  for (let k = 0; k < 6; k++) {
    const S = createGame('regulation', 'pengame-' + k, { auto: true });
    for (let i = 0; i < 60 * 60 * 30 && S.phase !== 'final'; i++) { step(S, {}); minMan = Math.min(minMan, ...S.manpower); }
    calls += S.log.filter((e) => e.type === 'penalty').length;
    const serve = S.log.filter((e) => e.type === 'penaltyServe').length, ends = S.log.filter((e) => e.type === 'penaltyEnd').length;
    open += serve - ends; unexplained += (serve - ends) - S.box.filter((b) => b.serving).length; if (S.phase !== 'final') bad++;
  }
  check(calls > 0 && minMan >= 3 && bad === 0 && unexplained === 0, `6 games: ${calls} penalties, fewest skaters on the ice ${minMan}, ${6 - bad} games finished, ${open} still serving at the horn (${unexplained} unaccounted)`);
}
console.log(fail ? `${fail} penalty check(s) failed` : 'all penalty checks pass');
process.exitCode = fail ? 1 : 0;
