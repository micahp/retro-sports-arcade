// Rules and format invariants over whole games.
import { createGame, step, DT } from '../src/sim.js';
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++; };
const count = (S, team, f = (p) => !p.isG) => S.skaters.filter((p) => p.team === team && f(p)).length;
const play = (S, maxSec, each) => { for (let i = 0; i < maxSec / DT && S.phase !== 'final'; i++) { step(S, {}); if (each) each(S); } };

// lineups for every manpower state
for (const [mode, sk, g] of [['regulation', [5, 5], [1, 1]], ['ot3', [3, 3], [1, 1]], ['pp', [5, 4], [1, 1]], ['en', [6, 5], [0, 1]]]) {
  const S = createGame(mode, 'lineup', { auto: true });
  check(count(S, 0) === sk[0] && count(S, 1) === sk[1] && count(S, 0, (p) => p.isG) === g[0] && count(S, 1, (p) => p.isG) === g[1],
    `${S.mode.label}: ${count(S, 0)}+${count(S, 0, (p) => p.isG)} vs ${count(S, 1)}+${count(S, 1, (p) => p.isG)}`);
}

// full regulation games: score only moves on goal events, faceoff at centre after each goal, puck never teleports
for (let g = 0; g < 3; g++) {
  const S = createGame('regulation', 'rules-' + g, { auto: true });
  let jump = 0, last = null, lastOwner = null;
  play(S, 1800, (S) => {
    const p = S.puck;
    if (last && S.phase === 'play' && p.owner && p.owner === lastOwner && !S.events.some((e) => e.type === 'faceoff')) {
      jump = Math.max(jump, Math.hypot(p.x - last.x, p.z - last.z) - Math.hypot(p.owner.vx, p.owner.vz) * DT);
    }
    last = { x: p.x, z: p.z }; lastOwner = p.owner;
  });
  const goals = S.log.filter((e) => e.type === 'goal').length;
  check(S.phase === 'final', `game ${g} reaches the final horn (${S.score.join('-')}, ${S.t.toFixed(0)} s)`);
  check(goals === S.score[0] + S.score[1] || S.log.some((e) => e.type === 'attempt'), `game ${g}: ${goals} goal events = score ${S.score.join('+')}`);
  let ok = true;
  S.log.forEach((e, i) => { if (e.type === 'goal' && !S.log.slice(i + 1).some((f) => f.type === 'faceoff' || f.type === 'final' || f.type === 'periodEnd')) ok = false; });
  check(ok, `game ${g}: every goal is followed by a faceoff or the end`);
  check(jump < 0.35, `game ${g}: carried puck never jumps (largest unexplained step ${jump.toFixed(2)} m)`);
  check(S.log.filter((e) => e.type === 'periodEnd').length >= 3, `game ${g}: three periods played`);
}

// overtime is sudden death
{
  const S = createGame('ot3', 'ot', { auto: true });
  play(S, 400);
  const goals = S.log.filter((e) => e.type === 'goal').length;
  check(S.phase === 'final' && goals <= 1, `3-on-3 overtime ends at the first goal or the horn (${goals} goal, ${S.t.toFixed(0)} s)`);
}
// shootout reaches a decision
{
  const S = createGame('shootout', 'so', { auto: true });
  play(S, 300);
  const at = S.log.filter((e) => e.type === 'attempt');
  check(S.phase === 'final' && S.score[0] !== S.score[1], `shootout decided ${S.score.join('-')} after ${at.length} attempts`);
}
console.log(fail ? `${fail} rule check(s) failed` : 'all rule checks pass');
process.exitCode = fail ? 1 : 0;
