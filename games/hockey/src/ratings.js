// M1. Player attribute schema (research/nhl95-reference-study/MECHANICS-MATRIX.md M1).
//
// Every skater and goalie carries `p.r`, a rating per attribute on a 0-100 scale. 50 is NEUTRAL: a
// neutral player reproduces the legacy engine constants exactly (each mechanic maps a rating to a
// multiplier that is exactly 1 at 50), so a neutral roster plays byte-for-byte like the legacy engine.
// Weight is in kilograms, neutral 90 (SKATE.mass). No hot/cold, home-ice or situational bonuses
// (deliberately out of scope for now).
//
// Which mechanic reads which attribute (only the ones implemented so far are live):
//   speed         top skating speed                            M2 (live with engine.skating = 'rated')
//   agility       acceleration, lateral edge grip, turn rate   M2 (live)
//   weight (kg)   acceleration (heavier accelerates slower)    M2 (live); check outcomes later (M16)
//   offAware      decision interval on offence (carrier)        M3 (live with engine.cadence = 'rated')
//   defAware      decision interval on defence (checks, pokes)  M3 (live)
//   shotPower, shotAccuracy, passing, stickhandling, checking, aggression, endurance: schema only (M6-M17)
//   goalie: reflexes, positioning, puckControl, agility, weight: schema only (M10-M13)
import { rng } from './rng.js';

export const NEUTRAL = 50;
export const SKATER_ATTRS = ['speed', 'agility', 'offAware', 'defAware', 'shotPower', 'shotAccuracy', 'passing', 'stickhandling', 'checking', 'aggression', 'endurance'];
export const GOALIE_ATTRS = ['reflexes', 'positioning', 'puckControl', 'agility'];
export const WEIGHT_NEUTRAL = 90;

/** A neutral rating block for a skater or a goalie. */
export function neutralRatings(isG) {
  const r = Object.fromEntries((isG ? GOALIE_ATTRS : SKATER_ATTRS).map((k) => [k, NEUTRAL]));
  r.weight = WEIGHT_NEUTRAL;
  return r;
}

// Rosters. 'neutral': everyone 50 / 90 kg. 'spread': an EXPERIMENT roster, not calibrated to anyone:
// each attribute ~ 50 + 15 N(0,1) clamped to 20-90, weight ~ 90 + 7 N(0,1) kg clamped to 75-110.
// Drawn from its own generator keyed by (game seed, team, role), so it never consumes the game's
// random stream and a player keeps the same ratings if the lineup is rebuilt (e.g. for overtime).
export function rosterRatings(kind, seed, team, role, isG) {
  const r = neutralRatings(isG);
  if (kind === 'neutral' || !kind) return r;
  if (kind !== 'spread') throw new Error(`unknown roster '${kind}'`);
  const R = rng(`${seed}#roster#${team}#${role}`);
  for (const k of Object.keys(r)) {
    if (k === 'weight') r.weight = Math.round(Math.max(75, Math.min(110, WEIGHT_NEUTRAL + 7 * R.normal())));
    else r[k] = Math.round(Math.max(20, Math.min(90, NEUTRAL + 15 * R.normal())));
  }
  return r;
}

/** Signed deviation from neutral in [-1, 1]: 0 at 50. */
export const dev = (v) => (v - NEUTRAL) / 50;
