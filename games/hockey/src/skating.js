// M2. Attribute-dependent skating. Multipliers on the SKATE constants, exactly 1 for a neutral player
// (rating 50, 90 kg), so a neutral roster with engine.skating = 'rated' reproduces 'legacy' exactly.
//
// Shapes follow NHL 95's skating (skate95.asm doplayeracc / playeracc: top speed from the speed
// rating; acceleration rising with agility and falling with weight), with ranges set to plausible
// physical spreads rather than NHL 95's (its best skater is 1.75x the worst; real NHL top speeds
// differ by roughly +-12%). These spreads are design choices, not fitted to any statistic:
//   top speed   x (1 + 0.12 dev(speed))         rating 0..100 -> 0.88..1.12   (7.9-10.1 m/s)
//   accel       x (1 + 0.25 dev(agility)) x sqrt(90 kg / weight)              (75 kg: x1.10, 110 kg: x0.90)
//   edges       x (1 + 0.20 dev(agility))       lateral acceleration (how tight a skater turns at speed)
//   turn rate   x (1 + 0.20 dev(agility))       how fast the body faces the direction of travel
import { dev, WEIGHT_NEUTRAL } from './ratings.js';

export const SKATING_SPREAD = { top: 0.12, accel: 0.25, edges: 0.20, turn: 0.20 };

export function skateFactors(r) {
  const S = SKATING_SPREAD;
  return {
    top: 1 + S.top * dev(r.speed),
    accel: (1 + S.accel * dev(r.agility)) * Math.sqrt(WEIGHT_NEUTRAL / r.weight),
    edges: 1 + S.edges * dev(r.agility),
    turn: 1 + S.turn * dev(r.agility),
  };
}
