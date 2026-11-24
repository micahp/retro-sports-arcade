// M1: attribute schema, neutral defaults, rosters on their own random stream.
import { createGame, step } from '../src/sim.js';
import { neutralRatings, rosterRatings, SKATER_ATTRS, GOALIE_ATTRS, NEUTRAL, WEIGHT_NEUTRAL } from '../src/ratings.js';
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++; };
const play = (opts, steps = 60 * 60 * 2) => { const S = createGame('regulation', 'rt-1', { auto: true, penalties: false, ...opts }); for (let i = 0; i < steps && S.phase !== 'final'; i++) step(S, {}); return S; };

{ // every player has a full rating block; the default roster is neutral
  const S = createGame('regulation', 'rt-0', { auto: true });
  const ok = S.skaters.every((p) => { const keys = p.isG ? GOALIE_ATTRS : SKATER_ATTRS; return keys.every((k) => p.r[k] === NEUTRAL) && p.r.weight === WEIGHT_NEUTRAL; });
  check(ok, `default roster: all ${S.skaters.length} players neutral (${NEUTRAL}, ${WEIGHT_NEUTRAL} kg)`);
}
{ // the spread roster varies players, stays in range, and is reproducible per (seed, team, role)
  const a = rosterRatings('spread', 'x', 0, 'C', false), b = rosterRatings('spread', 'x', 0, 'C', false), c = rosterRatings('spread', 'x', 1, 'C', false);
  const inRange = SKATER_ATTRS.every((k) => a[k] >= 20 && a[k] <= 90) && a.weight >= 75 && a.weight <= 110;
  check(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c) && inRange, `spread roster reproducible, differs by player, in range (C speed ${a.speed}, agility ${a.agility}, ${a.weight} kg)`);
}
{ // ratings never consume the game's random stream: with nothing reading them, rosters can't change a game
  const n = play({}), s = play({ engine: { roster: 'spread' } });
  check(JSON.stringify(n.log) === JSON.stringify(s.log), `neutral vs spread roster with legacy mechanics: identical logs (${n.log.length} events)`);
}
check(JSON.stringify(neutralRatings(true)) !== JSON.stringify(neutralRatings(false)), 'goalies and skaters have their own attribute sets');
console.log(fail ? `${fail} rating check(s) failed` : 'all rating checks pass');
process.exitCode = fail ? 1 : 0;
