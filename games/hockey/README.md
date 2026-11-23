# Rink '95: 5-on-5 hockey milestone

A playable arcade hockey game: regulation 5 on 5 with goalies, 3-on-3 sudden-death overtime and a shootout. It has puck physics that are tested on their own, passing, wrist and slap shots, body checks and poke checks, goalie saves and rebounds, and formation-based team AI. It uses one visual style: Gridiron's sprite stack, picked in `experiments/r0-renderer-test/`.

The mechanics are in the arcade-hockey genre. The teams (Harbor, Foundry), the art and the rink branding are original. **The physics are physically understandable but tuned for play:** a slap shot is faster than a wrist shot, which is faster than a pass; the puck slows on ice; the boards absorb energy; skaters have momentum and edge grip. The game is not a biomechanics simulation.

## Play

- **Phone or desktop:** `dist/rink95.html` is one self-contained file. It needs a `<!doctype html>` wrapper or the artifact viewer. Rebuild it with `npm run build`.
- **Development:** serve this folder (`python -m http.server`) and open `index.html`.

**Controls:**
- **With the puck:** PASS, and SHOOT (tap for a wrist shot, hold for a slap shot; the ring shows the charge).
- **Without the puck:** SWITCH to the skater nearest the puck, and CHECK. Skating into a player at speed is a hit; slow and close is a poke check.
- **Stopping:** push the stick hard against your direction of travel for a hockey stop.
- **Keyboard:** WASD, J, K.

## Formats (`src/config.js` `MODES`, `LINEUPS`)

| Mode | Skaters | Notes |
|---|---|---|
| Regulation | 5 + G vs 5 + G | 3 × 3-minute periods; ends switch each period; tie → 3-on-3 OT → shootout |
| Overtime | 3 + G vs 3 + G | sudden death, then a shootout |
| Power play | 5 vs 4 | test format for manpower states |
| Empty net | 6 + 0 vs 5 + G | extra attacker, goalie pulled |
| Shootout | 1 vs G, alternating | best of 3, then sudden death |

Lineups are built from a skater count per side, so 4 on 4 and 5 on 3 are one config line each. Penalties that *create* those states are not implemented yet.

## What is tested (`npm test`, all passing)

**`tests/puck.test.mjs`: the puck on its own.** The same nine scenarios run in the in-game Puck Lab, which can replay each one on the rink.

| Scenario | Result |
|---|---|
| Free slide | 15 m/s stops after 8.8 s and 63 m; never speeds up between board hits |
| Board rebound | in at (10, 10) m/s, out at (7.8, −5.5): mirrored angle, energy lost |
| Corner wrap | a rimmed puck follows the curved boards round the corner (110 frames in contact) |
| Goal and crossbar | low through the mouth scores; over 1.22 m does not |
| Post | rings off the post and stays out (puck is sub-stepped so it can't tunnel through) |
| Net from behind | bounces off the back of the net, no goal |
| Lead pass | arrives on a teammate skating across at 6 m/s; largest unexplained puck jump 0.09 m |
| Interception | a defender in the lane picks it off 12 of 12 |
| Goalie | from 10 m: 100% saved at the goalie, 23% at the corner |

**`tests/match.test.mjs`: rules and formats.**
- The lineups are correct for all four formats.
- Full games reach the final horn, with the score equal to the goal events.
- Every goal is followed by a faceoff.
- A carried puck never moves more than 0.12 m per frame beyond the skater's own motion.
- Overtime is sudden death, and the shootout reaches a decision.

**`tests/controls.test.mjs`: every button through the real input path.**
- Tapping SHOOT gives a 25 m/s wrist shot; holding it gives a 35 m/s slap shot.
- A pass goes out and control follows it.
- SWITCH picks the skater nearest the puck.
- Stick up skates; reversing the stick at speed is a hockey stop.

**`tests/poses.test.mjs`:** all 12 actions bake with a full-length stick.

**`npm run season`:** 10 full auto-played games, as a calibration report rather than a pass/fail test.

| | value | reference |
|---|---|---|
| goals per game | 9.0 | NHL about 6; arcade games run higher |
| save % on shots on goal | .859 | NHL about .905 |
| shots per game (attempts) | 82 | each game is 9 minutes of play |
| share of attempts on goal | 0.78 | NHL about 0.55: **too accurate** |
| pass completion | 0.73 | |
| hits per game | 18 | |
| posts per game | 3.6 | |
| longest dead puck | 0.7 s | before the fix, a board battle could deadlock for 27 s |

## Defects found and fixed while building this

- A slow loose puck got stuck in an endless deflection off the skaters next to it.
- A 50-50 puck could deadlock because each skater had only one pickup try.
- Fast pucks tunnelled through posts.
- Board friction compounded per substep and killed rims dead in the corners.
- The carried puck jumped up to 0.36 m in one frame on animation changes.
- The goalie saved 94% of shots on goal.

## Not done yet (next)

- **Rules:** offside, icing, penalties, line changes, and faceoff placement after offside or icing.
- **Gameplay:**
  - one-timers and deflection shots;
  - the AI passes rarely in the offensive zone and checks too often (about 200 attempts a game);
  - shots are too accurate (0.78 on goal);
  - the goalie has no glove or blocker hand rules beyond picking the animation.
- **Animation:**
  - The goalie uses the skater body with goalie poses; there are no pads or blocker models.
  - The team palette also colours the goalie.
  - Skating turns have no crossover animation.
- **Real playtests:** a structured comparison against arcade-hockey footage, and feel tests on real phones. Only headless and simulated checks have been run; nobody has played this with their hands yet.

## Layout

```
src/config.js     rink, rules, physics constants and game formats
src/puck.js       pure puck physics: friction, height, boards, posts, net, bodies, lead passes
src/sim.js        match flow, possession, shots, passes, checks, goalies, overtime, shootout
src/ai.js         role and formation targets by possession and zone, carrier and defender decisions
src/helpers.js    shared rule helpers
src/poses.js      hockey actions on Gridiron's skeleton (skate, glide, wrist, slap, pass, check, stop, fall, goalie stance and saves)
src/render.js     sprite-stack renderer, portrait camera, puck readability, debug overlays
src/scenarios.js  puck lab scenarios (shared by tests and the in-game lab)
src/main.js       loop, controls, menus, lab
vendor/           gridiron-physics web/stack + mesh/footlock @ 49c4000 (one import path changed), three.js r160
tests/            node tests; season.mjs calibration
build.py          bundles everything into dist/rink95.html
```
