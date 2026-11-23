# Measurement audit (Phase 1)

Audited commit: `b4769f9` (sim) plus the read-only observer in `calibration/observer.mjs`.

## How events are measured

The sim writes a flat event log (`S.log`) and a few counters (`S.stats`). The counters are too coarse to calibrate against, and some are wrong, as shown below. So all calibration numbers come from the **observer**. Each step it reads the new log entries and the state, and builds lineage: every shot attempt gets exactly one outcome, every pass gets one outcome, and every possession gets an end reason.

**The observer cannot change the game.** It never writes to sim objects (WeakMaps only) and never draws random numbers. `calibration/verify.mjs` plays seeds with and without it and compares the full logs and final states: 12 of 12 were identical.

## Definitions

| Statistic | Definition used here | NHL definition it is compared with |
|---|---|---|
| Shot attempt | A release of a wrist or slap shot (`shot` event). Shootout attempts excluded. | Shot attempt (SAT / Corsi): on goal + missed + blocked |
| Shot on goal (true) | An attempt that scores, or is saved **and** was on target: its release velocity predicts it crossing the goal line inside the posts and under the bar | Shot on goal: a goal, or a save of a shot that would have gone in |
| Shot on goal (sim-credited) | Goals plus every goalie save the sim counts, including saves of shots that were going wide | (no NHL equivalent) |
| Missed | Crossed the goal-line plane wide or high, hit the outside of the net, or hit the boards before the goal line | Missed shot |
| Blocked | Deflected off an opposing skater's body or stick before reaching the goalie | Blocked shot (since 2023-24 includes blocks by the shooter's teammate) |
| Blocked by teammate | Deflected off the shooter's own teammate | Counted inside NHL blocked shots since 2023-24 |
| Short | Taken under control by any skater before reaching the net, with no deflection | (rare in the NHL; folded into missed or blocked by scorers) |
| Save | Goalie save on a live shot (catch or rebound) | Save |
| Goal | Puck fully across the goal line between the posts, under the bar | Goal |
| Rebound shot | Attempt by the same team within 3 s of a rebound save | No official definition; analytics sites use 2-3 s windows |
| Pass | A released pass (`pass` event) | Not recorded by the NHL |
| Completion | Received by a teammate; split by whether the puck touched anything on the way | — |
| Interception | Received by an opponent while the pass was live | Takeaway (partly); NHL takeaways and giveaways are subjective |
| Turnover | Possession changes team. The cause is read back over the previous 2 s: interception, poke, hit, save, shot, or loose recovery | Giveaway or takeaway (subjective in the NHL) |
| Check attempt | A check animation starts (observer sees `hCheck` begin) | Not recorded |
| Check contact | The check reached an opponent in range (`check` event) | Not recorded |
| Hit | The target was knocked down (`hFall` begins) | Hit, a scorer judgement that includes contact without a knockdown, so NHL hits ≥ knockdowns by definition |
| Deflection | Loose puck bounced off a body with a real impact (`deflect`) | — |
| Stoppage | Phase change to whistle (goal, freeze, penalty) or intermission | Whistles: also offsides, icing, puck out of play, injuries, etc. |
| Faceoff | `faceoff` event | Faceoff |
| Penalty, power-play opportunity | `penalty` event; one opportunity per penalty to the other team (added after this audit, see below) | Power-play opportunity |

## Identities checked (1,000 training games)

| Identity | Holds |
|---|---|
| score = goal events | 100% |
| sim shot counter = observed attempts | 100% |
| attempts = goals + saves + missed + blocked + blocked-by-teammate + short + other | 100% |
| passes = completions + interceptions + other | 100% |
| faceoffs = opening + period starts + goals + freezes − the sudden-death winner | 99.7% |

## Lineage defects found in the sim's own counters

These are measurement defects in `S.stats` and the log. They are why the observer exists. **They are not fixed, because fixing them changes what the sim counts, and that is for review.**

1. **The goalie is credited with saves of shots that were going wide.** `trySave` triggers on any shot passing within the goalie's reach, whether or not it was on target. 18.5% of all saves were on off-target shots, which inflates both shots on goal (77.1% of attempts as credited vs 64.4% true) and save percentage (.890 credited vs .868 true).
2. **A shot keeps its "shot" tag after being blocked.** `pk.shot` is only cleared on possession, so a puck deflected off a defender can still be "saved" as that shot: 331 saves in 1,000 games had no live shot behind them. That is the 0.33 per game gap between the sim's save counter and lineage saves.
3. **A pass stays "live" until someone takes the puck,** even after it hits the boards or a skate. 26% of completions happened after contact (`complete-after-contact`), and the sim counts them as completed passes.
4. **Goals are not linked to shots.** 6.2% of goals came from no tracked shot: deflections, pucks off bodies, passes into the net. Own goals are possible; the sim credits the team whose net it isn't.
5. **"Check" in the old season script meant contacts, not attempts.** I earlier reported about 200 "check attempts" a game. That number counted contacts (`check` events). Real attempts are 255 a game, contacts 196, knockdowns 16.
6. **The evaluator mislabelled overtime games.** `evaluate.mjs` at first inferred overtime from end-of-period events, so every game decided by a sudden-death goal was labelled regulation. `report.mjs` now derives the result from the goals' periods, and `evaluate.mjs` is fixed.
7. **An earlier figure I gave was wrong.** I said about 55% of NHL attempts are on goal. The 2024-25 league totals give 47.5%.

## Not observable (reported as such, not estimated)

- **Things the sim doesn't model at all:** offsides, icing, puck out of play, line changes, fatigue and injuries. Those NHL stoppage and faceoff causes have no counterpart, so stoppage and faceoff counts cannot match by construction.
- **NHL reference distributions** (per-game SDs and percentiles) and **conditional NHL rates** (shooting % by distance and type, rebound rates, score effects): these need the game-level and shot-level tables in the local `nhl-dataset` DuckDB, which needs a DuckDB reader installed (approval needed).
- **Passes, completions and possession time in the NHL:** not published; they would need tracking data.
- **Time in each score state:** not yet measured, so score-effect rates are not computed; only shares of attempts by state are.
- **Shot location:** recorded as distance and angle from the release point, not the NHL's scorer-recorded location.
- **NHL 95 pacing:** no reliable measurements found (see `references.json` → `unavailable.nhl95`). The gameplay reference study is designed to produce them.

## Penalties (added after this audit)

Penalties were added after the 1,500-game baseline. With penalties off, the game is byte-for-byte identical to `b4769f9` (`calibration/verify-penalties-off.mjs`: 10 of 10 seeds), so **the baseline is the penalties-off configuration of the current code**. A penalties-on baseline is still to be run.
