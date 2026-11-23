# Baseline discrepancies, suspected causes, and proposed experiments (Phase 4)

These come from the baseline in `REPORT.md`: 1,000 training and 500 holdout games at `b4769f9`, penalties off. **No parameter has been changed.** Each experiment below is a proposal, to be run with paired seeds (`evaluate.mjs --override ...` against the same `train` seeds, compared with `compare.mjs`) and confirmed on `holdout` seeds before anything is merged. Every experiment reports all headline measures, not just its target, so a fix that breaks something else is visible.

Train and holdout agree within about 1 point on every measure, so the gaps below are systematic, not noise.

## Priority 1: shot selection and accuracy (the shot funnel is wrong)

| | Rink '95 | NHL 2024-25 |
|---|---|---|
| attempts on goal (true) | 64.4% | 47.5% |
| missed | 5.7% | 24.4% |
| blocked | 16.1% | 28.1% |
| shooting % on goal | 13.2% | about 10.0% |
| attempts from 0-6 m | 63% (wrist shots average 5.2 m) | not yet extracted; NHL shot distances are typically much longer |

**Suspected mechanisms (code):**
- **The AI shoots almost only from point-blank range.** `ai.js` carrier logic gives a 45% chance per 0.15 s decision when within 8 m, and only 12% per decision from 8 to 17 m when unpressured. So most shots come from in close, where shooting % is 17.9%.
- **The aim model is too accurate.** `releaseShot` (`sim.js`) aims at ±0.75 m around the centre with ±spread (wrist 0.45 m), inside a 0.91 m half-mouth. There is no aiming error that grows with distance, pressure or shot type, so misses happen almost only at extreme angles.
- **Too few blocks for the shooting distance.** Few bodies stand in shooting lanes: the defensive AI positions on the puck–net line only loosely, and no skater actively lies down or steps into lanes.

**Experiments (one at a time, paired seeds):**
- **E1.** Aim error that scales with distance and pressure (for example, angular error σ growing with distance and with the nearest opponent's distance). Expect missed share up and on-goal share down. Watch shooting %, goals per game and rebounds.
- **E2.** AI shot selection by expected value: more shots from 8 to 16 m, fewer forced in-tight attempts. Expect the distance distribution to shift out, shooting % down, and blocks up. Watch goals per game, which may fall and then need E1 adjusted, not the goalie.
- **E3.** Defensive lane-blocking positioning, done only after E2, because blocks depend on where shots come from. Expect blocked share up. Watch pass interceptions and possession length.

## Priority 2: goalie save logic counts misses and has almost no freezes

- **18.5% of saves are on shots going wide** (lineage defect 1). The save model is decided by lateral distance to the goalie, not by whether the shot is on target.
- **The goalie almost never covers the puck:** 27 freezes in 1,000 games. A catch requires the puck above 0.45 m, under 27 m/s, and then a 60% roll, but AI shots rarely arrive that high at the goalie. Without freezes, offsides or icing, a game has **10.3 faceoffs, against 56.6 in the NHL**, and play almost never stops.
- **True save % is .868 against .900**, partly because most shots are point-blank (priority 1).

**Experiments:**
- **E4.** Only on-target shots trigger a save attempt; wide shots are left to miss. Measurement-visible: phantom saves should go to 0%, sim-credited and true shots on goal should converge, and save % will drop. Run **after E1/E2**, otherwise save % falls further from the target.
- **E5.** Freeze and cover rules: a goalie can cover any controllable puck at his body (low shots included), with a chance based on rebound control. Expect freezes and faceoffs per game up and rebound shots (20.6% of attempts) down. Watch goals per game.

## Priority 3: checking is spammed, and knockdowns are rare

- **255 check attempts a game, 77% making contact, 6.3% knocking someone down: about 16 knockdowns a game.** No NHL count of attempts exists; NHL hits (42.9 a game) are scorer-recorded and include contact without a knockdown, so contacts and NHL hits are not the same measure. The attempt rate is the clear outlier: about 28 a minute.
- **Suspected cause:** `ai.js`. The chaser checks whenever close with closing speed over 3.2 m/s (12% per step at 60 Hz: about half the time within 0.1 s, almost always within 0.5 s), plus a 5% per-step poke when within 1.7 m. Decisions are per step, not per decision interval.

**Experiment:**
- **E6.** Move check and poke decisions to the same 0.15 s decision cadence as the carrier, and require a committed approach: closing speed and angle at the start, not just proximity. Expect attempts down sharply. Watch hits, turnovers by hit (12.6% of possession ends), penalties (once on) and goals.

## Priority 4: too few overtimes and almost no shootouts

| | Rink '95 | NHL 2024-25 · 2025-26 |
|---|---|---|
| tied after regulation | 13.1% | 20.7% · 24.8% |
| shootout | 0.3% | 5.9% · 9.1% |

The tie rate is close to what independent Poisson scoring at 7.3 goals a game predicts (15.1%). **So the low tie rate mostly follows from high scoring, not from a separate defect.** NHL ties are more common at about 6 goals a game.

The shootout gap is overtime-specific: 3-on-3 overtime here almost always produces a goal within 5 minutes of clock (only 3 of 131 overtimes reached a shootout; the NHL decides about 72% in overtime).

**Experiment:**
- **E7.** None directly. Re-measure after E1 and E2 change scoring. Then examine overtime alone: goals per minute at 3-on-3 against the NHL's, which needs the 3-on-3 shot data from nhl-dataset.

## Priority 5: possession and passing

- **Interceptions are 27% of passes.** There is no NHL reference (passes aren't published), but combined with a 6.6 s median possession and 0.5 passes per possession, it suggests passing is too risky and too rare. **This needs tracking data (Big Data Cup) before any target is set.**
- **Proposal:** extract pass completion and possession length from the Big Data Cup 2026 tracking data referenced in the reuse audit, before experimenting.

## Priority 6: a small edge for team 0

- Team 0 wins 53.6% of games (goals 3.72 vs 3.54, about 2.2 standard errors) with symmetric AI and 49.3% of faceoffs.
- **Suspected cause:** update-order effects. Team 0's skaters come first in every loop: intents, actions, collisions, pickup ties.
- **Experiment:**
  - **E8.** Alternate or shuffle the update order each step (seeded), and check that team 0's edge disappears on paired seeds.

## Running order and rules

1. Fix the measurement defects first (E4's scope plus clearing `pk.shot` on deflection), as a separate change.
2. Then E2 → E1 → E3 → E6 → E5, one change per paired run.
3. Log every run in `history.jsonl` with its commit and override.
4. Never accept a change that moves a priority-1 or priority-2 measure the wrong way by more than its holdout CI.
5. Run a penalties-on baseline before calibrating power-play rates. Current placeholder chances give 1.4 penalties per team per 9-minute game against 2.7 per 60-minute NHL game, but pacing equivalence across period lengths is itself an open question, for the NHL 95 study to inform.

**No claim of statistical validation is made.** The only validated claims are that the measurements are internally consistent and stable across seed sets.
