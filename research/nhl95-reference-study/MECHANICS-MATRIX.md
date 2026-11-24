# Mechanics comparison: NHL 95 (Genesis) → Rink '95

**Purpose:** NHL 95-quality gameplay on a credible hockey simulation, **not** NHL 95's statistics. The pilot (STUDY.md §3a) shows NHL 95 reaches NHL-like scores through about twice the NHL's shots and a .94 save %. So each proposal below takes NHL 95's *mechanism* (what makes it play well) and states where the outcome should be NHL-realistic instead. **No probability multipliers are fitted to NHL 95's totals.**

**Evidence:**
- **Source:** the reverse-engineered Genesis source ([abdulahmad/NHL95Genesis](https://github.com/abdulahmad/NHL95Genesis), byte-exact rebuild). It's read for behaviour only: nothing is copied, and the repository has no license.
  - **read:** taken from the instructions;
  - **label:** depends on the project's names or comments.
- **Emulator:** measured on the user's ROM (`STUDY.md` §3).
- **Community:** the Segathon guide. Hypotheses only.

**Rink '95 references** are to `games/hockey/src` at `19ac80c`.

**Units:** rink units, about 3 per foot (≈ 0.1 m). "Tick" is a decision tick (see M3).

---

### M1. Player ratings
- **Genesis routine:** `setplayer`, `AttributeCalc`, `BoostAttribute` (players95.asm).
- **NHL 95 behaviour:**
  - **Ratings** (read): 15 per skater, each the roster value × 5 plus hot/cold ÷ 3, clamped to 0–30.
  - **Bonuses:** power play, penalty kill, home/away, and **trailing or tied late in the 3rd**.
  - **What they drive:** skating, AI tempo, the shoot/pass bias, check odds, penalty odds and goalie puck control.
  - **Community** ("×5 then randomised"): confirmed in form.
- **Rink '95 now:** **no ratings at all.** Every skater shares the `SKATE` constants. *(This corrects an earlier claim that ratings nudged speed and shot strength.)*
- **Proposed improvement:**
  - A per-player rating block, seeded per roster: speed, agility, weight, shot power, shot accuracy, stickhandling, passing, checking, aggression, offensive awareness and defensive awareness, plus goalie ratings.
  - Situational bonuses as small, named terms.
  - Hot/cold as a per-game seeded offset.
- **Verification test:** a unit test that a rating maps monotonically to its effect. In a paired-seed batch, swapping two players' ratings swaps their outcome shares.

### M2. Skating and attribute-dependent movement
- **Genesis routine:** `doplayeracc`, `playeracc`, `dostop`, `stopna`, `updatevel`, the `MaxSpeed` table (skate95.asm).
- **NHL 95 behaviour** (read):
  - **Acceleration** ∝ (96 − weight/4 + agility) / 2 per frame, so **heavier is slower to accelerate, more agile is quicker.**
  - **Top speed** from the speed rating: (rating + 20)², a **1.75× spread** from worst to best. Scaled by energy when line changes are on. A goalie carrying the puck is held to half.
  - **Drag:** about 1/64 of velocity per frame while skating.
  - **Facing and stopping:** 8 facing directions with gradual turning. Reversing more than 90° goes into backward skating or a hard stop at a constant deceleration.
- **Rink '95 now:** one top speed (9 m/s, 0.92× when carrying), one acceleration (6.5 m/s²), braking 15 m/s², with continuous direction, for everyone.
- **Proposed improvement:**
  - Drive top speed from speed, acceleration from agility and weight, and turn rate from agility, using **physical units**: NHL top skating speeds are about 9–11 m/s.
  - Keep continuous direction; don't copy the 8-way grid.
  - Add the mass effect to check outcomes (M16).
- **Verification test:**
  - **Unit test:** time from 0 to top speed, and stopping distance, per rating level.
  - **Footage check:** compare against emulator frame-advance measurements of skating (study §3 footage table).

### M3. AI decision cadence
- **Genesis routine:** `asspuckc`, `assdefd`, `assnearest`, `assgoaliecpu` (logic95.asm).
- **NHL 95 behaviour** (read):
  - **Offence:** players decide every (30 − awareness/2)/2 ≈ **7–15 frames**.
  - **Defence:** at awareness/2.
  - **Goalie:** awareness/4.
  - **Speed-ups:** halved for the defending team's chaser when the carrier is in the slot; faster with the goalie pulled.
- **Rink '95 now:** the carrier decides every 0.15 s. **Checks and pokes roll every 60 Hz step.**
- **Proposed improvement:** decisions on a per-player countdown from awareness, for every decision type, checks included.
- **Verification test:**
  - **Unit test:** the decision interval matches the rating.
  - **Batch:** check attempts per game fall from 255 (E6 in DIAGNOSIS.md).

### M4. Offensive positioning
- **Genesis routine:** `asswingo`, `asscentero`, `assdefo`, the `.postab2` carrier targets (logic95.asm).
- **NHL 95 behaviour:**
  - **Wingers and centre** (label): skate to *a random spot in the puck zone*, re-picked on the decision tick.
  - **Defencemen** (label): hold the points and drop back at once when the other team gains the puck.
  - **The carrier** (read) skates toward one of a set of target spots by position.
  - **Community:** wings set up low for cross-crease passes.
- **Rink '95 now:** fixed role slots, and special-teams slots (`ai.js`).
- **Proposed improvement:** spot sets by zone and role, with seeded choice and re-pick on the tick, so formations move instead of sitting on fixed slots. *Read `asswingo` and `asscentero` in full first.*
- **Verification test:** heat maps per role in the batch, compared against emulator player trajectories (capture C4).

### M5. Defensive assignments
- **Genesis routine:** `assdefd`, `assdefdchase`, `asswingd`, `asscenterd`, `assnearest`; `HmDefMode`/`AwDefMode` set to 1 at game start (hockey95.asm).
- **NHL 95 behaviour** (read):
  - **One chaser:** whichever teammate is **nearest to where the puck will be** (puck position plus velocity), re-picked continually.
  - **Chaser in the slot:** when the carrier is in the slot, the chaser gets **+6 speed** and **double checking**.
  - **In the defensive zone,** with the opponent on the puck: **the RD holds the slot; the LD plays halfway between the puck and the goal line.** That confirms the community "LD chases, RD stays home" claim.
  - **Elsewhere:** the D hold mirrored lanes ±65 units, about 50 units off the deepest attacker.
- **Rink '95 now:** role slots plus one chaser chosen by distance to the puck now.
- **Proposed improvement:**
  - Pick the chaser by the predicted puck position.
  - Give the in-zone D pair distinct jobs: net-front and strong-side.
  - The urgency boost when the slot is threatened.
  - Keep both sides of the asymmetry rating-driven, not hard-wired to LD/RD.
- **Verification test:**
  - **Scenario test:** puck carrier in a corner → one defender is net-front and one engages.
  - **Batch:** the shot share from the slot falls.

### M6. Shot selection and shooting lanes
- **Genesis routine:** `chk4shot`, `CompShoot` (logic95.asm).
- **NHL 95 behaviour** (read):
  - **Within about 10 m of the goal:** shoot chance about 8/(32 − bias/2) per tick, **halved for each opposing skater in the 8-way lane** to the goal.
  - **Farther out:** about 1/16 of that.
  - **Empty net:** always shoots.
  - **CPU teams** run the shot check on half their ticks.
- **Rink '95 now:** 45% per 0.15 s inside 8 m, 12% at 8–17 m; **no lane check.**
- **Proposed improvement:**
  - Shot choice by **lane and shot quality**: distance, angle, defenders in the cone from puck to net, and goalie position.
  - Scale by the shooter's bias rating.
  - Lane blocking pushes shots outward and raises blocks; both are needed (on-goal 64% vs NHL 47.5%, blocked 16% vs 28%).
- **Verification test:**
  - **Paired-seed batch** (DIAGNOSIS E2): shot-distance distribution moves out, blocked share rises, on-goal share falls.
  - **Holdout confirmation.**

### M7. Carrier under pressure
- **Genesis routine:** `asspuckc` threat count, `chk4shot` (logic95.asm).
- **NHL 95 behaviour** (read):
  - **Threat:** an opponent within about 20 units (≈2 m) of the carrier's next position.
  - **Response,** on 1 tick in 4: **clear the puck from his own end, otherwise pass.**
  - **Carrier steering:** turns away from a threat directly ahead.
- **Rink '95 now:** the carrier keeps carrying. Possession ends 12.6% by hit and 8% by poke.
- **Proposed improvement:** a pressure response weighed by rating (stickhandling vs passing): protect, pass, or chip the puck out.
- **Verification test:** batch possession-end mix (hit and poke turnovers fall, pass share rises), and median possession length.

### M8. Pass selection and passing lanes
- **Genesis routine:** `chk4pass`, `dopass` (logic95.asm).
- **NHL 95 behaviour** (read):
  - **One random teammate per tick.** The pass is rejected if:
    - an **opponent nearer than the target sits in the same 8-way direction** (lane blocked);
    - the target is unavailable;
    - the pass would be offside;
    - the target is too far back inside his own blue line.
  - **Unthreatened carriers** pass only sometimes, using the **shoot-vs-pass bias, not the passing rating.**
  - **Community:** pass speed looks the same for every player.
- **Rink '95 now:** a lead pass to the best-scored teammate, with no lane rule. 27% of passes are intercepted.
- **Proposed improvement:** **lane-clear test on a continuous cone** (not 8-way); pass speed and accuracy from the passing rating; target choice by lane and receiver space.
- **Verification test:**
  - **Batch:** interceptions per pass fall.
  - **Unit test:** a blocked lane is never chosen.
  - **NHL reference:** pass completion from Big Data Cup tracking (DIAGNOSIS priority 5).

### M9. One-timers and distinct offensive actions
- **Genesis routine:** `asspassrec` → `assonetimer`, `onetimershot`, `breakaway`, `assbreakaway`, `CompShoot` deke (logic95.asm).
- **NHL 95 behaviour** (read):
  - **A CPU pass receiver in the attacking zone always one-times the pass** (one at a time); outside the zone, 1 in 8.
  - **Breakaways** get their own assignment and a deke.
  - **Manual:** drop pass, fake shot, flip pass.
  - **Community:** centres take about 95% of one-timers.
- **Rink '95 now:** no one-timers, no breakaway logic, no dekes.
- **Proposed improvement:**
  - **One-timers:** shoot directly off the pass when the receiver's angle, distance and facing allow. **Gate by rating and situation, not "always"**: NHL 95's rule is a source of its excess shots.
  - **Breakaway handling:** deke vs shoot by distance and the goalie's position.
- **Verification test:**
  - **Scenario:** cross-ice pass to a set receiver gives a one-timer.
  - **Batch:** share of shots within 0.5 s of a pass, against NHL "shot off a pass" share from tracking data.

### M10. Goalie positioning
- **Genesis routine:** `findpc` (the crossing-point table), `assgoaliecpu` (logic95.asm).
- **NHL 95 behaviour** (read):
  - **Prediction:** the game predicts **where and when the puck will cross each goal line**, and the goalie plays that point.
  - **Reaction cadence:** defensive awareness / 4.
  - **Return:** back to the crease when out of it.
  - **Loose pucks:** he dives on a slow loose puck in the crease area.
- **Rink '95 now:** the goalie tracks the puck's current position; lateral speed 4.5 m/s.
- **Proposed improvement:**
  - Goalie targets the **predicted crossing point** for shots and passes.
  - Depth (challenge) by shooter distance.
  - Reaction time from rating.
- **Verification test:**
  - **Scenario:** a cross-crease pass makes the goalie push across before the puck arrives.
  - **Batch:** phantom saves fall to 0% (with M11).

### M11. Save outcome
- **Genesis routine:** `puckgoalie` (collide95.asm); `goaliesave` picks the animation (logic95.asm).
- **NHL 95 behaviour** (read):
  - **A puck that touches the goalie's collision shape is always stopped,** either held or rebounded. **There is no save probability:** the per-goalie save odds table is no longer read in NHL 95.
  - **Goals come only from pucks that miss his body.**
  - **The save animation** (blocker, glove, pad stack, kick, butterfly, shoulder, stick, dive) is chosen by puck height, side, timing and hand, and so sets the shape.
- **Rink '95 now:**
  - **save decision:** a probability from lateral distance, speed and reaction;
  - **phantom saves:** wide shots are "saved" (18.5% of saves).
- **Proposed improvement:**
  - **Geometric saves:** a goalie collision shape per save action, sized from real goalie dimensions and moved by M10. A goal is any puck that crosses the line outside it.
  - **Tuning:** this replaces probability tuning with geometry, tuned to the NHL .900, not NHL 95's .94.
- **Verification test:**
  - **Unit test:** a puck through the shape never scores; a puck outside it is never saved.
  - **Batch:** save % on true shots on goal against the NHL .900, phantom saves at 0%.

### M12. Puck retention and goalie freezes
- **Genesis routine:** `puckgoalie` → `puckglue`; `assgoaliecpu` hold timer; `AddPenalty2(PenGhold)` (logic95.asm, collide95.asm).
- **NHL 95 behaviour** (read):
  - **Held or rebound:** a puck slower than a random threshold (base plus up to the goalie's puck-control rating) is **held**; a faster one rebounds.
  - **The hold:** a held puck starts a **1.5 s timer**. During it the goalie passes out if no opponent is within about 9 m, else **the whistle blows and there's a faceoff**.
- **Rink '95 now:** a catch needs the puck above 0.45 m, under 27 m/s, then a 60% roll. **27 freezes in 1,000 games.**
- **Proposed improvement:**
  - **Hold or rebound:** by speed against a control rating, and by body part (glove holds; pads and blocker rebound).
  - **After a hold:** cover and whistle, or play it, by pressure.
- **Verification test:**
  - **Batch:** freezes and faceoffs per game rise toward NHL stoppage rates (with M19).
  - **Rebounds:** rebound share of attempts falls from 20.6%.

### M13. Rebounds
- **Genesis routine:** `puckgoalie .bounceoff`, `deflect` (collide95.asm).
- **NHL 95 behaviour** (read): the rebound velocity is the **puck's offset from the goalie's centre**, so it goes away from the body, low and slow (vertical speed cleared). Puck-body deflections are randomised in `deflect`.
- **Rink '95 now:** the rebound comes from the save probability path.
- **Proposed improvement:** rebound direction from the contact point and the body part; speed from incoming speed × a body-part restitution.
- **Verification test:**
  - **Scenario:** a pad save sends the rebound out to the side, not back into the slot.
  - **Batch:** rebound goal share.

### M14. Shot blocking
- **Genesis routine:** `CanBlock`, `SPAblock` inside `check4check` (logic95.asm).
- **NHL 95 behaviour:**
  - **The block** (read): the branch runs `CanBlock` and the block action for **non-joystick** skaters before any check. The project's comment says the opposite ("a joystick player blocks"), so **the code and the label disagree. To confirm in the emulator.**
  - **Community:** the CPU uses laydown blocks well.
  - **Manual:** A in the defensive zone.
- **Rink '95 now:** no deliberate blocks; 16% blocked by bodies in the way.
- **Proposed improvement:** a defender in the lane commits to a block when a shot is likely (lane, distance, facing, rating), with a recovery cost.
- **Verification test:**
  - **Emulator:** find `SPAblock` use by CPU players (capture C4).
  - **Batch:** blocked share toward the NHL's 28%.

### M15. Checking decisions
- **Genesis routine:** `check4check`, `check4check2`, `assnearest` (logic95.asm).
- **NHL 95 behaviour** (read):
  - **Roll:** about 7/(40 − checking) per tick, **halved with penalties On**.
  - **Target:** within ±30 units (≈3 m) in the **exact facing direction**.
  - **Check type:** a speed-burst check, or a hook/hold check in the slot or 1 time in 4.
  - **Lunge:** the chaser also rolls for a 4-second lunge.
- **Rink '95 now:** 12% per 60 Hz step on closing speed above 3.2 m/s; no facing rule, no rating. **255 attempts a game.**
- **Proposed improvement:**
  - Check on the decision tick (M3).
  - A facing cone and committed approach.
  - Odds from checking rating and situation.
  - Penalty risk feeds back into restraint, as NHL 95's penalties-on halving does.
- **Verification test:**
  - **Batch:** attempts per game fall.
  - **Hits:** knockdowns and contacts stay measurable.
  - **Emulator:** hits per game (capture C3).

### M16. Check outcome
- **Genesis routine:** `CCStart`, `FallDown`, `Bcheck`, `holdcheck` (collide95.asm).
- **NHL 95 behaviour** (read):
  - **Body check:** a burst check with impact above a threshold on a skater **knocks him down**, after the penalty roll (M17).
  - **Poke/sweep check:** trips the target if he's within one direction of the checker's facing.
  - **Hook/hold:** ties both players to their average velocity, the target flails.
  - **Effect on the puck:** the knocked-down carrier drops it and can't touch it for 30 frames.
  - **Community:** big, slow players check weakly without a running start.
- **Rink '95 now:** contact plus closing speed; 6.3% of attempts knock down.
- **Proposed improvement:** knockdown from **relative momentum** (mass from weight × closing speed) against the target's balance (agility, weight), not a flat threshold.
- **Verification test:** paired scenario, heavy vs light checker at the same speed. Batch knockdowns per contact.

### M17. Penalty generation
- **Genesis routine:** `CCStart`, `Bcheck`, `holdcheck`, `checkint` (collide95.asm); `checkagr`, `AddPenalty` (penalty95.asm).
- **NHL 95 behaviour** (read):
  - **Every hard check** rolls about 5 in 230–325 against the hitter's **aggression**. A low roll calls **charging or slashing**; otherwise roughing or cross-checking is possible. **Which of each pair is a coin flip on a frame-counter bit,** so the name is cosmetic.
  - **Trips and hooks/holds** roll the same way.
  - **Goalie interference:** contact with the goalie in his crease, 6 in (30 − aggression).
  - **Roll odds:** doubled near the puck, halved for human-controlled players.
  - **Penalty shots:** checked for fouls on breakaways (`PenShotChk`).
  - **Emulator:** charging 29%, slashing 26%, hooking 13%, interference 9%.
- **Rink '95 now:** 4 infractions with fixed placeholder chances per contact type (`PENALTY.chance`).
- **Proposed improvement:**
  - **Each infraction caused by the actual foul:** speed and from-behind for charging and boarding; stick contact for hooking, tripping and slashing; a hit on a non-carrier for interference.
  - **Odds from aggression and situation; no coin-flip names.**
  - **Penalty shots** on fouled breakaways.
- **Verification test:**
  - **Unit test:** each infraction is only called on its foul.
  - **Batch:** PP opportunities per team per 60 against the NHL's 2.7 (2024-25) or 4.85 (1993-94); **not** NHL 95's 7.6.

### M18. Icing, offsides and stoppages
- **Genesis routine:** `pucknorm` (`PuckIChk`, `ChkOffsides`, still-puck timer), `a2offsides`, `a2touchpuck` (logic95.asm).
- **NHL 95 behaviour:**
  - **Every frame, on the puck itself:** icing and offside checks (read).
  - **Still puck:** a loose puck that hasn't moved for **120 frames (2 s)** gets a whistle (read).
  - **Manual:** icing is always called, even with penalties off.
  - **Offside:** depends on the penalties option.
  - **Not yet read:** the `PuckIChk` and `ChkOffsides` bodies are in other files.
- **Rink '95 now:** none; 10 faceoffs a game against the NHL's 57.
- **Proposed improvement:**
  - **Icing:** NHL rules (hybrid icing optional).
  - **Offside:** with delayed offside and tag-up.
  - **Still-puck whistle.**
  - **Faceoff:** at the correct dot.
- **Verification test:**
  - **Scenario per rule:** dump from behind the red line → icing; attacker ahead of the puck at the line → offside.
  - **Batch:** faceoffs per game toward the NHL's 56.6.

### M19. Pulled goalie
- **Genesis routine:** `CPgoalie`, `ChkGoalies`, `ReturnGoalies` (logic95.asm, label).
- **NHL 95 behaviour:** the computer pulls its goalie when trailing by 2 late in the 3rd, and on a delayed penalty.
- **Rink '95 now:** empty-net mode only, set by hand.
- **Proposed improvement:** an automatic pull by score, time and possession, plus a delayed-penalty extra attacker.
- **Verification test:** scenario (trailing by 1–2 in the last minute → goalie pulled when the team has the puck); batch empty-net goals.

### M20. Special-teams outcome
- **Genesis routine:** PP/PK bonuses (`setplayer`); `assnearest` PP checks; PK positioning (to read).
- **NHL 95 behaviour** (emulator): **24% of goals short-handed, more than power-play goals**; PP conversion 9–15%.
- **Rink '95 now:** PP and PK formations, slots sorted D first.
- **Proposed improvement:** don't reproduce. Find the cause in NHL 95 (PK bonus, pressure response, one-timer rule against a box) only to avoid it.
- **Verification test:** batch SH-goal share against the NHL's about 3%, and PP% against about 20%.

### M21. Period length, penalty length and overtime ✅ implemented
- **Genesis routine:** `PerTimeTotal`, penalty box timer (`tmpdst`) (penalty95.asm, ram95.asm).
- **NHL 95 behaviour** (emulator):
  - **Clock:** period length changes only the clock; per-minute rates are the same at 5, 10 and 20 minutes.
  - **Minors:** fixed 2:00 of game clock.
  - **Overtime:** 10-minute OT counting down, then a tie.
- **Rink '95 now:** **`nhl95` mode (`19ac80c`):** 5, 10 or 20-minute periods (default 10), fixed 2:00 minors, a 10-minute 5-on-5 sudden-death OT that carries penalties over, then a tie.
- **Proposed improvement:** done. The old 3-minute mode stays as "Quick game" for the baseline.
- **Verification test:** `tests/nhl95.test.mjs`. `calibration/verify-modes-unchanged.mjs`: 30/30 games of the existing modes identical.

---

**Order of work** (each step is one change, paired seeds, holdout confirmation, no merge before review):
1. **M1 and M3:** ratings and decision cadence. Every later mechanic reads ratings.
2. **M10 + M11 + M12:** goalie geometry, freezes, rebounds. These fix the measurement defects, phantom saves and freezes.
3. **M18:** icing, offsides and stoppages.
4. **M6 + M8 + M7:** shot and pass lanes, pressure.
5. **M15 + M16 + M17:** checking and penalties.
6. **M9:** one-timers.
7. **M5 and M4:** positioning.
8. **M19.**

## References
| Source | URL | Evidence type | Use |
|---|---|---|---|
| NHL95Genesis (reverse-engineered source) | https://github.com/abdulahmad/NHL95Genesis | Instructions (byte-exact rebuild); names and comments are interpretation | Primary for mechanics; behaviour only, nothing copied (no license) |
| Segathon, "NHL 95 Strategy" (no author; © 2015) | https://www.segathon.com/nhl-95-genesis-strategy/ | **Community gameplay observation** | Hypotheses to check. Confirmed so far: ratings ×5 (M1); LD pressure / RD slot (M5); weight slows acceleration (M2) |
| NHL-95.com team pages, e.g. Philadelphia | https://nhl-95.com/teams/philadelphia-fliers.php | **Roster data**, community-compiled; columns undefined | Test cases for rating effects, after checking values against the ROM roster data |
