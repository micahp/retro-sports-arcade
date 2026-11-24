// NHL 95 rules profile: period-length options, fixed 2:00 minors, 10-minute 5-on-5 sudden-death OT, ties.
import { createGame, step, callPenalty, penaltySeconds, DT } from '../src/sim.js';
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++; };
const run = (S, sec) => { for (let i = 0; i < sec / DT && S.phase !== 'final'; i++) step(S, {}); };
const skater = (S, team, role) => S.skaters.find((p) => p.team === team && p.role === role);
const toPlay = (S) => { for (let i = 0; i < 400 && S.phase !== 'play'; i++) step(S, {}); };

{ // period length options; default 10 minutes; a bad option is refused
  const d = createGame('nhl95', 'n1', { auto: true });
  check(d.clock === 600 && d.periodSec === 600, `default period ${d.clock} s`);
  for (const sec of [300, 1200]) { const S = createGame('nhl95', 'n1', { auto: true, periodSec: sec }); check(S.clock === sec, `${sec / 60}-minute periods: clock starts at ${S.clock}`); }
  let threw = false; try { createGame('nhl95', 'n1', { periodSec: 180 }); } catch { threw = true; }
  check(threw, '3-minute periods are not an NHL 95 option');
}
{ // the next period starts at the chosen length, not the mode default
  const S = createGame('nhl95', 'n2', { auto: true, periodSec: 300, penalties: false }); toPlay(S);
  S.clock = 0.2; run(S, 0.5);
  for (let i = 0; i < 600 && S.period === 1; i++) step(S, {});
  check(S.period === 2 && Math.abs(S.clock - 300) < 1, `period 2 starts at ${S.clock.toFixed(0)} s`);
}
{ // a minor is 2:00 of game clock at every period length (the old mode still scales)
  for (const sec of [300, 600, 1200]) { const S = createGame('nhl95', 'n3', { auto: true, periodSec: sec }); check(penaltySeconds(S) === 120, `${sec / 60}-minute periods: minor ${penaltySeconds(S)} s`); }
  check(Math.abs(penaltySeconds(createGame('regulation', 'n3', { auto: true })) - 18) < 1e-9, 'Quick game (3-minute periods) still scales the minor to 18 s');
}
{ // tied after regulation: 10-minute 5-on-5 sudden death; a penalty carries into it
  const S = createGame('nhl95', 'n4', { auto: true, periodSec: 300 }); toPlay(S);
  S.period = 3; S.score = [2, 2]; S.clock = 0.2;
  const p = skater(S, 1, 'LD'); run(S, 0.1); if (S.phase === 'play') callPenalty(S, p, 'hooking');
  const inBox = S.box.some((b) => b.serving);
  for (let i = 0; i < 1200 && S.period === 3; i++) step(S, {});
  toPlay(S);
  const on = [0, 1].map((t) => S.skaters.filter((q) => q.team === t && !q.isG && !q.benched && !q.retired).length);
  check(S.period === 4 && S.modeKey === 'ot95' && Math.abs(S.clock - 600) < 1, `overtime: period ${S.period}, ${S.modeKey}, clock ${S.clock.toFixed(0)} s`);
  check(!inBox || (S.box.some((b) => b.serving) && on[1] === 4), `penalty carried into OT: ${inBox ? `${on[0]} on ${on[1]}` : 'no penalty was called (skipped)'}`);
}
{ // a goal in OT ends it; no goal in 10 minutes is a tie (never a shootout)
  let ended = 0, ties = 0, shootouts = 0;
  for (let k = 0; k < 6; k++) {
    const S = createGame('nhl95', 'n5-' + k, { auto: true, periodSec: 300 }); toPlay(S);
    S.period = 3; S.score = [1, 1]; S.clock = 0.1;
    for (let i = 0; i < 60 * 60 * 15 && S.phase !== 'final'; i++) step(S, {});
    if (S.phase === 'final') ended++;
    if (S.score[0] === S.score[1]) ties++;
    if (S.shootout) shootouts++;
    const ot = S.log.filter((e) => e.type === 'goal' && e.score && (e.score[0] + e.score[1]) > 2);
    if (ot.length > 1) { check(false, 'more than one OT goal'); }
  }
  check(ended === 6 && shootouts === 0, `6 overtimes finished (${ties} ties, ${6 - ties} decided by a goal), no shootouts`);
}
{ // OT that runs out with the score level ends as a tie
  const S = createGame('nhl95', 'n7', { auto: true, periodSec: 300, penalties: false }); toPlay(S);
  S.period = 3; S.score = [3, 3]; S.clock = 0.1;
  for (let i = 0; i < 1200 && S.period === 3; i++) step(S, {});
  toPlay(S); S.clock = 0.2;
  for (let i = 0; i < 120 && S.phase !== 'final'; i++) step(S, {});
  check(S.phase === 'final' && S.score[0] === 3 && S.score[1] === 3 && !S.shootout && /TIE/.test(S.banner), `OT expired: ${S.phase}, ${S.score.join('-')}, "${S.banner}"`);
}
{ // a full NHL 95 game finishes
  const S = createGame('nhl95', 'n6', { auto: true, periodSec: 300 });
  for (let i = 0; i < 60 * 60 * 40 && S.phase !== 'final'; i++) step(S, {});
  check(S.phase === 'final', `full 5-minute-period game: ${S.score.join('-')}, ${S.log.filter((e) => e.type === 'penalty').length} penalties`);
}
console.log(fail ? `${fail} NHL 95 rules check(s) failed` : 'all NHL 95 rules checks pass');
process.exitCode = fail ? 1 : 0;
