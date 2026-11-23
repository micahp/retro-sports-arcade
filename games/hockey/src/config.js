// Rink, rules and physics constants. SI units: metres, seconds, m/s.
// Rink markings follow standard North American dimensions (200 x 85 ft).
// Physics values are arcade-tuned: physically ordered (slap > wrist > pass,
// puck slows on ice, boards absorb energy) but chosen for readability at 60 fps.

const FT = 0.3048;
export const RINK = {
  hx: 100 * FT,            // half length, 30.48 m
  hz: 42.5 * FT,           // half width, 12.95 m
  corner: 28 * FT,         // corner radius, 8.53 m
  goalX: (100 - 11) * FT,  // goal line, 11 ft from the end boards
  blueX: 25 * FT,          // blue lines, 25 ft either side of centre
  mouth: 3 * FT,           // half the goal mouth (6 ft wide)
  crossbar: 4 * FT,        // 1.22 m
  netDepth: 3.67 * FT,     // 1.12 m
  crease: 6 * FT,          // crease radius
  centreR: 15 * FT,
  dotX: (100 - 31) * FT,   // end-zone faceoff dots, 20 ft out from the goal line
  dotZ: 22 * FT,
  nzDotX: 20 * FT,         // neutral-zone dots, 5 ft inside the blue lines
  boardH: 42 / 12 * FT,
};

export const PUCK = {
  radius: 0.0381,
  iceDecel: 0.9,           // m/s^2 sliding friction (arcade: real ice is lower, passes would never die)
  drag: 0.05,              // 1/s
  gravity: 9.81,
  boardRest: 0.6, boardTan: 0.85,
  postR: 0.03, postRest: 0.55,
  bodyR: 0.36, bodyRest: 0.25,  // loose puck hitting a skater's body
  maxControl: 19,          // fastest puck a skater can settle on the stick
  receiveReach: 0.75,      // stick reach for a pickup, from the blade
  settle: 0.09,            // seconds to draw a received puck onto the blade (no snapping)
};

export const SHOT = {
  wrist: { speed: 25, lift: [0.2, 3.0], spread: 0.45, windup: 0.5, release: 0.6 },
  slap: { speed: 35, lift: [0.0, 4.0], spread: 0.9, windup: 0.95, release: 0.62 },
  pass: { min: 11, max: 19, lead: true },
};

export const SKATE = {
  max: 9.0, carryFactor: 0.92, accel: 6.5, brake: 15, glide: 0.6, lateral: 14,
  turnRate: 7, bodyR: 0.39, mass: 90,
  checkMinSpeed: 3.2,      // closing speed needed to knock a skater down
  checkReach: 1.35, pokeReach: 1.7,
};

// Penalties. Minor = 2:00 of a 20-minute period. 'proportional' scales it with the period
// length (18 s in a 3-minute period); 'fixed' keeps 2:00 of game clock whatever the period.
// The infraction chances are UNTUNED placeholders: they say how often contact of each kind
// is called, and must be calibrated against power-play opportunities per game, not guessed.
export const PENALTY = {
  enabled: true, minorSec: 120, scale: 'proportional', maxServing: 2,
  chargingSpeed: 7.5,                // closing speed (m/s) above which a hit can be charging
  chance: { hooking: 0.10, interference: 0.35, charging: 0.25, boarding: 0.30 },
};

export const GOALIE = { lateral: 4.5, depthMin: 0.5, depthMax: 1.4, body: 0.3, reach: 0.34, react: 0.22, catchSpeed: 27 };

// Game formats. Roles listed per side; 'G' is the goalie.
export const LINEUPS = {
  0: [],
  5: ['LW', 'C', 'RW', 'LD', 'RD'],
  4: ['LW', 'C', 'LD', 'RD'],
  3: ['C', 'RW', 'LD'],
  6: ['LW', 'C', 'RW', 'LD', 'RD', 'X'],   // extra attacker, goalie pulled
};
export const MODES = {
  regulation: { label: 'Regulation 5 on 5', skaters: [5, 5], periods: 3, periodSec: 180, ot: 'ot3', goalies: [true, true], penalties: true },
  ot3: { label: 'Overtime 3 on 3', skaters: [3, 3], periods: 1, periodSec: 300, suddenDeath: true, then: 'shootout', goalies: [true, true] },
  pp: { label: 'Power play 5 on 4', skaters: [5, 4], periods: 1, periodSec: 120, goalies: [true, true], penalties: true },
  en: { label: 'Empty net 6 on 5', skaters: [6, 5], periods: 1, periodSec: 90, goalies: [false, true] },
  shootout: { label: 'Shootout', shootout: true, rounds: 3 },
  lab: { label: 'Puck lab', skaters: [0, 0], periods: 1, periodSec: 9999, goalies: [false, false], lab: true },
};
