# NHL 95 (Genesis) behaviour from the reverse-engineered source, against Rink '95

**Source:** [abdulahmad/NHL95Genesis](https://github.com/abdulahmad/NHL95Genesis), read on 2026-11-23. It reassembles byte-for-byte into the retail ROM, SHA-1 `09e87b07…09b44`. The ROM used for the emulator runs has this same SHA-1.

**Licensing:** the repository has no license file, and its content derives from EA's game. **Nothing here copies its code, tables or comments.** These are behaviour descriptions in our own words, with the routine names as references. Rink '95 code must be written fresh from these descriptions.

**Confidence:** the byte-exact rebuild shows the *instructions* are right. Routine names, field names and comments are the project's interpretation. Each claim below is marked:
- **read:** read directly from the instructions;
- **label:** depends on the project's naming;
- **to measure:** check in the emulator.

**Coordinates:**
- Goal lines are at ±267 rink units and blue lines at ±86 (`chk4shot`, `chk4pass`; read).
- NHL goal lines are 89 ft from centre, which gives about **3 units per foot** along the rink.
- The blue lines then sit at 29 ft, not the NHL's 25 ft, so the rink is not exactly to scale.
- Distances below use 3 units/ft as an approximation.

## 1. Player ratings drive everything (`setplayer`, players95.asm)

Every skater has these ratings: weight, agility, speed, offensive awareness, defensive awareness, shot power, checking, handedness, fighting, stickhandling, shot accuracy, endurance, a **shoot-vs-pass bias**, passing and aggression.
- **Storage (read):** each is a 4-bit roster value scaled to 0–30.
- **Situational bonuses (read):**
  - power play;
  - penalty kill;
  - home or away;
  - **third period while trailing or tied** (from halfway through the third, or in OT).

Two ratings set the AI's tempo directly (read):
- **Offensive awareness sets how often a player makes a decision** with the puck or on offence: a countdown of roughly 7–15 frames, shorter for better players. Defensive awareness does the same on defence.
- **The shoot-vs-pass bias** (`spodds`) feeds both the shot and the pass decisions.

**Rink '95:** every skater shares the same movement constants and decision odds, and ratings only nudge speed and shot strength. **Of everything here, this is the largest structural difference.**

## 2. The puck carrier (`asspuckc`, `chk4shot`, `chk4pass`)

**Each decision tick** (the offensive-awareness countdown):

1. **Threat** (read): count opponents within about ±20 units (≈7 ft) of where the carrier will be next frame.
2. **Shoot check** (read): for a **computer-controlled team, the shoot check runs on only about half the ticks** (a frame-counter bit). On the other ticks it goes straight to the pass check.
3. **Under threat** (read): on 1 tick in 4,
   - **dump/clear the puck if in its own end,**
   - **otherwise pass.**
4. **Shot odds otherwise** (read): the chance is about 8/N, with N set by the shoot-vs-pass bias.
   - **Within about 100 units (≈33 ft, 10 m) of the goal:** N runs from about 17 (shooter-minded) to 32. That's a **25–50% chance per decision**.
   - **Each opposing skater in the shooting lane doubles N.** The lane is the same 8-way direction from the puck to the goal.
   - **Farther out:** N is 16× larger, so about **2–3% per decision**.
   - **With the goalie out** (pulled or away): **it always shoots.**
   - **Only in the attacking half**, and never on a delayed offside.
5. **Pass check** (read):
   - **Unthreatened:** passes only sometimes (a roll against 16 + bias, threshold 12).
   - **Threatened:** always tries.
   - **Target:** **one random teammate**, rejected if any of these hold:
     - the target is the goalie, unavailable or locked in an animation;
     - the pass would be offside;
     - the target is more than ~15 units behind the carrier inside his own blue line;
     - **an opponent nearer than the target sits in the same 8-way direction** (lane blocked).
   - No rescoring and no "best option": if the random pick fails, there's no pass this tick.

**Rink '95 (ai.js):**
- **shot chance:** 45% per 0.15 s decision inside 8 m, 12% at 8–17 m when unpressured.
- **lanes:** no shooting-lane blocking.
- **pressure:** no dump-or-pass response to pressure.
- **ratings:** no rating-dependent cadence or bias.

**Implications for calibration (to test):**
- Two NHL 95 rules would push shots outward and raise the block share, both in the direction the baseline needs:
  - a blocker in the lane **halves** the shot chance;
  - pressure leads to passes.
- Long shots are much rarer than in Rink '95 at 8–17 m. So NHL 95 may also be in-close heavy; **the emulator shot data will tell.**

## 3. Checking (`check4check`, `check4check2`)

Before looking for a target, a computer skater rolls a check chance from its **checking rating** (read):
- **Base odds:** about 7 in (40 − checking). For an average checker that's about 28% per call.
- **Penalties On halves it:** 7 in 2 × (40 − checking). **The CPU checks half as often when penalties are on.**
- **Target:** an opponent within ±30 units (≈10 ft, 3 m) on both axes, **in the exact 8-way direction the checker faces**, and not a goalie, fighting or locked in an animation.
- **Check type:**
  - a speed-burst check, normally;
  - otherwise an "A" (hook/hold) check, when the carrier is in the slot, or 1 time in 4.
- The `check4check2` variant (used when chasing on defence) adds a test on where the puck sits relative to the checker.

**Rink '95:**
- a 12% chance **per 60 Hz step** whenever closing speed exceeds 3.2 m/s;
- no facing requirement and no rating, so the result is 255 attempts a game.
- NHL 95 rolls per decision tick (every ~7–15 frames, label), needs facing, and scales with rating.
- **Rough rate:** NHL 95's per-second check rate in comparable situations looks several times lower. **To measure** from emulator hit counts.

## 4. Goalie (`assgoaliecpu`, `goaliesave`, `findpc`)

- **Prediction** (read): the game predicts **where and when the puck will cross each goal line** (`findpc`). The goalie AI plays that predicted crossing point, not the current puck position.
- **On a save** (read):
  - the goalie gets a lateral velocity to reach the crossing point;
  - the save animation is chosen by height, side, timing and handedness: blocker, glove, pad stack, kick, butterfly, high shoulder or stick, plus dive saves on top-shelf shots.
- **The save itself** (to read next): `goaliesave` picks the animation. Whether the puck is stopped is decided by the collision code, the goalie–puck part of collide95.asm. **Not yet read.**

**Rink '95:** the save is decided by lateral distance to the goalie, whether or not the shot was on target. That's the phantom-save defect, and NHL 95's crossing-point prediction is the natural fix.

## 5. Other systems present (not yet read)

| Routine | What it covers (label) |
|---|---|
| `assonetimer`, `asspassrec` | Computer one-timers on passes in the attacking zone |
| `assbreakaway`, `breakaway` | Breakaway handling, deke at the goal |
| `CPgoalie`, `ChkGoalies` | Pull the goalie when trailing by 2 late in the third, or on a delayed penalty |
| `pucknorm`, `a2offsides` | Icing and offsides on the puck itself |
| `CanBlock` | Shot blocking (joystick player) |
| skate95.asm | Acceleration, turning and stopping by speed and agility ratings, multiplied by frames elapsed |
| penalty95.asm | Which infractions exist, including tripping with a penalty-shot variant |

## 6. Memory addresses for the emulator recorder (read, verified against the running game: see below)

| Value | Address |
|---|---|
| Period (0–2, 3 OT, 4 game over) | `$FFC020` |
| Game clock | `$FFC022` |
| Period length in seconds | `$FFC026` |
| Home team block (shots, PP goals, PPs, penalties, PIM, attack time, score at +0…+C) | `$FFC288` |
| Away team block (same layout, block size $366) | `$FFC5EE` |
| Goal summary (6 bytes each) and its length | `$FFC02E`, `$FFC02C` |
| Penalty summary (4 bytes each) and its length | `$FFC198`, `$FFC196` |
