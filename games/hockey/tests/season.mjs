// Plays N full auto games and prints the numbers that say whether it plays like hockey.
import { createGame, step } from '../src/sim.js';
const N = +(process.argv[2] || 6);
const T = { goals: 0, shots: 0, saves: 0, passes: 0, done: 0, ints: 0, hits: 0, checks: 0, deflect: 0, posts: 0, ot: 0, so: 0, games: 0, maxLoose: 0 };
for (let g = 0; g < N; g++) {
  const S = createGame('regulation', 'season-' + g, { auto: true });
  let loose = 0;
  for (let i = 0; i < 60 * 60 * 30 && S.phase !== 'final'; i++) {
    step(S, {});
    if (S.phase === 'play' && !S.puck.owner && Math.hypot(S.puck.vx, S.puck.vz) < 0.3) { loose += 1 / 60; T.maxLoose = Math.max(T.maxLoose, loose); } else loose = 0;
  }
  const c = {}; for (const e of S.log) c[e.type] = (c[e.type] || 0) + 1;
  T.games++; T.goals += S.stats[0].goals + S.stats[1].goals; T.shots += S.stats[0].shots + S.stats[1].shots; T.saves += S.stats[0].saves + S.stats[1].saves;
  T.passes += S.stats[0].passes + S.stats[1].passes; T.done += S.stats[0].passesDone + S.stats[1].passesDone; T.ints += S.stats[0].intercepts + S.stats[1].intercepts;
  T.hits += S.stats[0].hits + S.stats[1].hits; T.checks += c.check || 0; T.deflect += c.deflect || 0; T.posts += c.post || 0;
  if (S.log.some((e) => e.type === 'attempt')) T.so++; else if (S.log.filter((e) => e.type === 'periodEnd').length > 3) T.ot++;
  console.log(`game ${g}: final ${S.score} phase ${S.phase} t=${S.t.toFixed(0)}s shots ${S.stats[0].shots}-${S.stats[1].shots}`);
}
const per = (k) => (T[k] / T.games).toFixed(1);
console.log({ goalsPerGame: per('goals'), shotsPerGame: per('shots'), savePctOnGoal: (T.saves / Math.max(1, T.saves + T.goals)).toFixed(3), onGoalShare: ((T.saves + T.goals) / Math.max(1, T.shots)).toFixed(2), passesPerGame: per('passes'), passCompletion: (T.done / Math.max(1, T.passes)).toFixed(2), interceptsPerGame: per('ints'), hitsPerGame: per('hits'), checkAttemptsPerGame: per('checks'), deflectionsPerGame: per('deflect'), postsPerGame: per('posts'), overtimeGames: T.ot, shootouts: T.so, longestDeadPuckSec: T.maxLoose.toFixed(1) });
