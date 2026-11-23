# NHL 95 gameplay reference study

**Goal:** establish, from the original game, which behaviours Rink '95 should reproduce: how the puck moves, how skaters accelerate and stop, how passing, shooting, checking and penalties work, how the camera follows play, and how scoring relates to period length. Then audit Rink '95 against them. **Each item is marked as one of:**
- **Verified:** from the manual.
- **Measurable:** from emulator runs.
- **Inference only:** hidden rules we can only infer.

Game: EA Sports *NHL 95*, Sega Genesis (USA/Europe). Not *NHL All-Star Hockey '95*, a different Sega game whose manual turns up in the same searches.

## 1. What the manual verifies

Source: *NHL 95* Genesis manual (USA/Europe), scanned copy in the archive.org "SEGA Genesis / Mega Drive Manuals" collection, file `NHL 95 (USA, Europe).pdf`. Page numbers are the manual's printed numbers.

| Topic | What the manual says | Page |
|---|---|---|
| CPU vs CPU | Move every controller icon to the centre CPU column on the Controller Setup screen and "the computer [plays] all players". Any button except START exits Demo mode. | 5, 2 |
| Default demo | Vancouver at the NY Rangers, regular season, three 10-minute periods, no penalties, no line changes, user records off, goalie control Manual | 5 |
| Period length | 5, 10 or 20 minutes; three periods | 6 |
| Overtime, regular season | One 10-minute sudden-death period; **if no one scores, the game is a tie** (no shootout in games) | 6 |
| Overtime, playoffs | Unlimited sudden-death periods, each as long as the chosen period length | 7 |
| Shootout | A separate play mode ("go one-on-one with the goalie"), not a tie-breaker | 6 |
| Ends | Home team attacks up-screen in periods 1 and 3, down-screen in period 2 | 6 |
| Penalties | On (all infractions), On except offsides, Off. **Icing is always called**, even with penalties off | 7, 12 |
| Power play | One penalized player is released when the other team scores on the power play | 12 |
| Penalty shots | Awarded for a penalty on a breakaway puck carrier | 12 |
| Icing | Puck shot or passed across the red line, the opponent's blue line and the goal line, unless through the crease; no two-line pass | 12 |
| Offsides | The puck must enter the attack zone before any attacker; faceoff outside the blue line | 13 |
| Injuries | A player can be hurt and leave for a period or the game; replaced automatically | 13 |
| Line changes | On (you change lines, players tire), Off (no fatigue, same players all game), Auto (computer changes lines, no fatigue); changes at stoppages or while controlling the puck | 7, 13 |
| Goalie control | Manual or Auto | 7, 10 |
| Ratings | Players rated from real 1993-94 performance; ratings 25 to 100 | 7, 8 |
| Faceoff | B controls or passes, C is a speed burst (body check) | 1 |
| Offence | B pass (D-pad aims; with no direction, passes where he faces); C wrist shot, hold for a slap shot (harder the longer you hold); D-pad up or down for height, left or right for corners; A clears or flip-passes in your own zone, fakes a shot in the attack zone, holds to change lines; A with up or down is a drop pass | 1, 9, 10 |
| One-timer | Pass with B, then press C as soon as the puck leaves the passer: the receiver redirects it without controlling it | 2, 10 |
| Control after a pass | Press B right after a long pass to take control of the receiver before the puck arrives | 9 |
| Defence | A holds or hooks (tap for a shot block); B poke check, trip, or switch to the closest player; C with D-pad is a speed burst (body check) | 2 |
| Shot blocking | In the defensive zone, A drops a defender to the ice to block a shot | 11 |
| Shots | Wrist shots are slower but more accurate than slap shots, best close to the goal | 9 |
| Instant replay | Rewind, freeze-frame, slow motion, re-centre the camera, reverse angle | 2 |
| Stats | START pauses and opens the scoreboard menu with game stats | 2 |

**Not in the manual, so it has to be measured:**
- the minor penalty length in game-clock time, and whether it scales with period length;
- the game-clock speed against real time;
- whether the clock stops at whistles;
- puck, shot and skating speeds;
- AI tendencies.

**Corrections to earlier claims:**
- The "Players → Demo" option exists in *NHL 94*. *NHL 95* does CPU vs CPU through the controller setup screen instead.
- I found no evidence of the "NHL95 Online League save-state exporter". The nearest is a 2005 nhl94.com forum project that extracted *NHL 94* stats from RAM. It should be treated as unverified until someone finds the tool.

## 2. Rink '95 against the manual

| NHL 95 behaviour | Rink '95 now | Status |
|---|---|---|
| 5 on 5 with goalies, three periods | yes | ✅ |
| Period length 5 / 10 / 20 min | one setting (`periodSec`), currently 3 min | ⚠️ add the 5/10/20 options |
| Regular-season OT: 10-min sudden death, then a tie | 3-on-3 OT, then a shootout (modern NHL) | ⚠️ different by design; add an "NHL 95 rules" format |
| Playoff OT: unlimited sudden-death periods | none | ❌ |
| Penalties On / On except offsides / Off | On / Off; no offsides | ⚠️ |
| Icing always called | no icing | ❌ |
| Offsides | none | ❌ |
| Power play, release on a power-play goal | yes | ✅ |
| Penalty shots on fouled breakaways | none | ❌ |
| Injuries | none | ❌ |
| Line changes and fatigue (On / Off / Auto) | no lines, no fatigue (equivalent to Off) | ⚠️ |
| Goalie Manual / Auto | AI goalie only (Auto) | ⚠️ |
| Wrist vs slap trade-off; slap harder the longer you hold | wrist and slap fixed at 25 / 35 m/s; holding only picks slap | ⚠️ add hold-to-power |
| Shot height (up/down) and corner aim | corner aim from the stick; height random | ⚠️ |
| One-timers | none | ❌ |
| Drop pass | none | ❌ |
| Fake shot | none | ❌ |
| Flip pass / clear | none | ❌ |
| Control switches to the pass receiver | yes, at the pass | ✅ |
| Hook / hold, trip | poke check only | ⚠️ |
| Body check as a speed burst | check action; no speed burst | ⚠️ |
| Defender drops to block a shot | none | ❌ (fits the low block share in the baseline) |
| CPU vs CPU | yes (auto mode, batch evaluator) | ✅ |
| Instant replay | none (debug trail only) | ❌ |
| In-game stats screen | debug line only | ⚠️ |

## 3. Experiments (feasibility first)

**Environment:**
- an emulator with frame stepping, input scripting and RAM reads;
- a **legally obtained NHL 95 image, supplied by you**;
- installing the emulator is a download and needs your OK.

**Emulator choice:** BizHawk (Lua scripting, memory reads, frame advance; uses Genesis Plus GX) or RetroArch with the Genesis Plus GX core. BizHawk is the better fit for unattended runs and RAM-based box scores.

| Phase | Experiment | Passes when |
|---|---|---|
| A | One CPU-vs-CPU game at the manual's demo settings (10-min periods, penalties off, line changes off) | It finishes unattended; the final score is read from the screen or RAM |
| B | One game each at 5 / 10 / 20-minute periods, plus a stopwatch measurement of the game clock against emulator frames (NTSC 59.92 fps) | Real seconds per game-clock second known for each length; whether the clock stops at whistles |
| C | 10 games per length, penalties On | Scores, shots and penalties per game read reliably; first look at scoring vs length |
| D | 100+ games per length | Distributions: total goals (0-2, 3-4, 5-6, 7-8, 9+), margins, ties, shots, save %, power-play opportunities and conversion |
| E | Repeat for NHL 94, NHL 96, then later generations | Changes across titles |

**Factors held fixed in C and D:** the same two teams (and both orders, for home ice), difficulty, goalie control Auto, line changes Off. Penalties and line changes are varied later, one at a time. Each game is recorded as: title, version, period length, penalties, line changes, teams, seed or start frame, final score by period, shots, penalties, power-play goals, game length in frames, and source (RAM or screen).

### Mechanics measured from footage and replay

Use instant replay's freeze-frame and slow motion, and emulator frame advance. Rink pixels convert to feet from the known 200 × 85 ft rink.

| Behaviour | Measure |
|---|---|
| Skating | Frames from standstill to top speed across the rink; top speed; stopping distance; turning radius at speed |
| Puck | Wrist and slap shot speed (and slap speed vs hold time); pass speed; puck slow-down on open ice; board rebound angle and speed |
| Possession | How far the puck sits from the stick; how a pass is received (snap or slide) |
| Checking | Speed needed for a knockdown; recovery time; how often a check changes possession |
| Goalie | Save, rebound and freeze shares by shot type and location |
| Penalties | Minor length in game-clock seconds at 5/10/20 min; what gets called |
| Camera | How far ahead of the puck it leads; how much ice is visible across and along |
| AI | Shot distances, pass frequency, forechecking pressure (descriptive; the rules behind them are inference only) |

## 3a. Results: Phases A–C pilot (2026-11-23)

**Setup:**
- **Game:** BizHawk 2.11.1, the user's ROM (SHA-1 matches NHL95Genesis), Vancouver at the NY Rangers, regular season, both teams CPU, goalies Manual (demo default), line changes Off.
- **Recorder:** reads RAM only, using addresses from `ram95.asm`, checked against the on-screen score of a full game.
- **One game per seed:** each starts from one puck-drop save state per configuration, with a recorded seed written into the game's only RNG (32-bit, `$FFCC6A`).

**Pitfalls found on the way:**
- **Menu delays don't reseed:** varying how long the game waited on a menu gave only 2 distinct games per configuration, because only odd versus even frame mattered.
- **Self-started games use the demo settings:** the game the emulator starts by itself after a game reverts to penalties Off.

Both were caught by checking the data before analysing it.

**Pilot only: 10 games per period length.**
- Good enough to validate the pipeline and to read the large effects.
- **Not** a calibration target.

| | 5-min periods | 10-min periods | 20-min periods |
|---|---|---|---|
| goals per game (both teams), mean · range | 2.0 · 1–7 | 3.8 · 1–7 | 6.9 · 2–11 |
| shots per game (both teams) | 33.8 | 63.2 | 123.8 |
| save % (goals / shots) | .941 | .940 | .944 |
| tied after regulation | 2/10 | 3/10 | 4/10 |
| tie after the 10-min OT | 0/10 | 1/10 | 3/10 |
| penalties per team per game | 2.9 | 5.0 | 11.3 |
| power plays per team per game | 2.3 | 3.8 | 7.8 |
| PP conversion | 7/46 = 15% | 6/76 = 8% | 14/156 = 9% |
| real minutes per game | 11.8 | 20.9 | 41.3 |
| **regulation only, per 60 game-minutes:** goals · shots · penalties | 7.2 · 120 · 22.8 | 7.2 · 122 · 18.8 | 6.8 · 116 · 21.4 |
| **overtime only:** OTs · OT game-minutes · goals | 2 · 17.4 · 2 | 3 · 13.1 · 2 | 4 · 37.2 · 1 |

The first version of this table mixed regulation and OT, and counted every OT as a full 10 minutes. **The OT clock counts down from 10:00, like other periods**; an earlier note said it counted up, from a single stale sample. Rates above are regulation only. Overtime is reported separately and is too small a sample to rate (9 OTs, 67.7 game-minutes, 5 goals).

**Timing, reconciled.** Two different clocks were reported:
- **Wall-clock:** how long a run took on the PC at 3–5× emulation speed. Phase A's "282 s" was wall-clock.
- **Real time:** emulated frames ÷ 59.92, the console experience. Phase A was 18.8 real minutes.

| Real seconds per game-clock second | Value |
|---|---|
| while the clock runs (all runs) | ≈ 0.41 (2.43 game-s per real s) |
| Phase A, penalties off, incl. stoppages | ≈ 0.58 (67,726 frames for 1,965 game-s from the 9:14 save state) |
| Phase C, penalties on, regulation incl. stoppages | 0.65–0.72 |

So a 10-minute period lasts about 5½ real minutes with penalties off and 6½ with them on.

**Findings:**
1. **NHL 95 doesn't compress scoring.** Goals, shots and penalties per game-minute are the same at every period length. A 5-minute-period game simply has about a quarter of the goals of a 20-minute one. Only 20-minute periods give NHL-like game totals: 6.9 goals against 6.5 in 1993-94.
   - **Rink '95 differs:** its 3-minute periods produce 7.3 goals a game, about 48 per 60 minutes of play. That's a design choice to make, not a bug.
2. **Game clock:** 2.39–2.46 game seconds per real second at every length while running. The clock stops at whistles: it is stopped 32–45% of the time with penalties on, 22–35% with penalties off.
3. **A minor penalty is a fixed 2:00 of game clock at every period length.** The median short-handed span is 120 s at 5, 10 and 20 minutes. Shorter spans are power plays ended by a goal and overlapping penalties; longer ones are back-to-back penalties. **It does not scale with period length.**
4. **The shot and save profile is not NHL-like:**
   - about 116 shots per 60 minutes, roughly twice the NHL's;
   - **save % about .94**, against .895 in 1993-94.
   - Rink '95's .868 is far on the other side.
5. **Penalties and power plays:**
   - about 20 penalties per 60 minutes, about 7.6 per team per 60 against 4.85 real;
   - **power-play conversion about 9–15%**, against 18.6% real.
6. **Overtime:** regular-season OT is 10 minutes, and **ties happen** (4 of 30 games). Overtime goals came in 5 of the 9 overtimes; OT is too short a sample to rate.

**Not yet measured:**
- faceoffs, hits and checks (no counters in the team block; need player-level addresses);
- shot locations;
- penalty types: the 4-byte penalty summary is recorded but not decoded.

**Raw data:**
- per-game JSONL in `E:\emu\work\runs\C3\` (not committed: emulator output, kept local);
- scripts `record.lua`, `aggregate.py` and `summarize.py` alongside.

## 4. Real-game comparison

*NHL 95* uses 1993-94 player ratings and was sold during the lockout-shortened 1994-95 season. Hockey-Reference league averages (per team per game):

| Season | Goals | Shots | Save % | PP opportunities | PP % |
|---|---|---|---|---|---|
| 1993-94 | 3.24 | 30.2 | .895 | 4.85 | 18.6% |
| 1994-95 | 2.99 | 29.3 | .901 | 4.36 | 17.7% |
| 2024-25 (for Rink '95) | 3.01 | 28.1 | .900 | 2.71 | 21.6% |

For the full distributions (shares of 0-2, 3-4, 5-6, 7-8 and 9+ combined goals, margins, ties), game-level 1993-94 and 1994-95 results are needed. They come from Hockey-Reference schedule pages or the local nhl-dataset; that DuckDB starts in 2007, so it does **not** cover 1993-95.

**Scoring compression ratio** = video-game goals per real minute of play ÷ NHL goals per real minute. It is measured for each period length, with the real duration taken from emulator frames, not the clock setting.

## 5. Questions this study answers for Rink '95

1. Should period length change only the clock? It shouldn't change the physics. Phase B and D results show whether NHL 95 also kept scoring near NHL levels at short lengths, which is a design choice for Rink '95 rather than a rule.
2. Penalty length policy: proportional or fixed. Phase B answers it for NHL 95.
3. Which missing mechanics matter most:
   - one-timers, the shot block and icing look highest-value from the baseline (shot funnel, stoppages);
   - offsides and line changes come next;
   - instant replay and injuries are presentation.
