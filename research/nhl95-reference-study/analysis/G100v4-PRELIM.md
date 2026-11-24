# NHL 95 Genesis recorder study — PRELIMINARY analysis

**Status: preliminary.** Built from 100 finished games in 3 period-length groups. Batch still running; no parameters are fitted from these results. Re-run `analyze_runs.py` on the full set to regenerate.

## Dataset

| config | games | seeds unique | start states | regulation shots (doshot) | mean real min/game |
|---|---|---|---|---|---|
| 10-pen | 33 | 33 | pd-10-pen-d7.state | 2960 | 20.6 |
| 20-pen | 33 | 33 | pd-20-pen-d7.state | 5956 | 39.8 |
| 5-pen | 34 | 34 | pd-5-pen-d7.state | 1641 | 12.1 |

## Validation checks

- ScoreSum goal count equals final score: 100/100 games.
- Goals linked to a shot event (approximate, 120 s window): 398/404 (99%). Scoring team and manpower state at the goal do not depend on the link.
- Period-quota leftovers (goals the period score says a team scored that could not be assigned): 0.
- Object-group mapping: group A (indices 0-5) = home (agreement score 9882; consistent with final shots).
- Shot events (doshot hook) vs final shot counters: 10557 vs 7184 (ratio 1.47). Shot-event totals are NOT the game's shot counter; the distance tables below use shot events.
- Shots more than 60 ft from the attacked net: 948/10557 (distance tables stop at 60 ft; a large share here would mean the attacking direction is wrong).
- Stoppage code 14 (AddPenalty2 call) occurs 403 times for 404 goals: it is the goal stoppage. Its puck position is where the goal went in.
- Scoring team and power-play flag come from the recorder v4 goal lines. Power-play goals per team match the game's own counter in 100/100 games. Goal calls with no score change (ignored): 70.
- Rink zone boundary (blue line at 225 units) and attacking direction are assumptions, not yet verified in the render.
- Goalie object indices assumed to be 5 and 11 (observed as the save/contact targets).

## Goals per game, shots, and percentiles (per game, both teams)

| config | period type | goals mean [p10, p50, p90] | shot events mean [p10, p50, p90] |
|---|---|---|---|
| 10-pen | all | 3.70 [1, 3, 6] | 89.7 [79, 90, 99] |
| 20-pen | all | 6.58 [3, 7, 10] | 180.5 [161, 176, 201] |
| 5-pen | all | 1.91 [1, 1, 3] | 48.3 [39, 47, 64] |

## Rates per 60 game-minutes with 95% CI (games resampled)

| config | period | goals | shot events | penalties (both teams) |
|---|---|---|---|---|
| 10-pen | REG (n=33) | 7.03 [5.64, 8.42] | 174.06 [170.00, 178.24] | 20.00 [18.06, 22.00] |
| 10-pen | OT (n=7) | 14.34 [6.15, 40.65] | 210.36 [185.57, 267.72] | 43.03 [26.09, 50.31] |
| 20-pen | REG (n=33) | 7.13 [6.00, 8.35] | 193.43 [180.18, 210.96] | 24.13 [22.03, 26.79] |
| 20-pen | OT (n=6) | 4.11 [1.18, 8.79] | 209.59 [179.54, 240.66] | 24.66 [21.50, 28.41] |
| 5-pen | REG (n=34) | 4.80 [3.36, 6.73] | 128.98 [112.72, 148.88] | 16.27 [13.20, 19.71] |
| 5-pen | OT (n=11) | 13.00 [9.75, 20.45] | 224.56 [206.30, 242.75] | 26.00 [13.59, 41.35] |

## Shooting by distance and angle (shot events; goal = matched to a goal, saved = goalie touch in 3 s)

| config | distance (ft) | shots | goals | sh% [95% Wilson] | goalie touch (3 s) | other |
|---|---|---|---|---|---|---|
| 10-pen | 0–10 | 24 | 5 | 20.8% [9.2%, 40.5%] | 18 | 1 |
| 10-pen | 10–20 | 613 | 53 | 8.6% [6.7%, 11.1%] | 538 | 22 |
| 10-pen | 20–30 | 788 | 33 | 4.2% [3.0%, 5.8%] | 718 | 37 |
| 10-pen | 30–40 | 625 | 20 | 3.2% [2.1%, 4.9%] | 547 | 58 |
| 10-pen | 40–60 | 625 | 4 | 0.6% [0.2%, 1.6%] | 536 | 85 |
| 20-pen | 0–10 | 57 | 7 | 12.3% [6.1%, 23.2%] | 44 | 6 |
| 20-pen | 10–20 | 1218 | 79 | 6.5% [5.2%, 8.0%] | 1102 | 37 |
| 20-pen | 20–30 | 1674 | 60 | 3.6% [2.8%, 4.6%] | 1527 | 87 |
| 20-pen | 30–40 | 1202 | 41 | 3.4% [2.5%, 4.6%] | 1042 | 119 |
| 20-pen | 40–60 | 1304 | 26 | 2.0% [1.4%, 2.9%] | 1105 | 173 |
| 5-pen | 0–10 | 16 | 2 | 12.5% [3.5%, 36.0%] | 13 | 1 |
| 5-pen | 10–20 | 352 | 28 | 8.0% [5.6%, 11.3%] | 312 | 12 |
| 5-pen | 20–30 | 469 | 15 | 3.2% [1.9%, 5.2%] | 438 | 16 |
| 5-pen | 30–40 | 299 | 10 | 3.3% [1.8%, 6.0%] | 268 | 21 |
| 5-pen | 40–60 | 343 | 7 | 2.0% [1.0%, 4.2%] | 290 | 46 |

| config | angle (deg from net-perpendicular) | shots | goals | sh% |
|---|---|---|---|---|
| 10-pen | 0–30 | 1306 | 71 | 5.4% |
| 10-pen | 30–60 | 1087 | 42 | 3.9% |
| 10-pen | 60–90 | 564 | 6 | 1.1% |
| 20-pen | 0–30 | 2537 | 130 | 5.1% |
| 20-pen | 30–60 | 2249 | 64 | 2.8% |
| 20-pen | 60–90 | 1159 | 21 | 1.8% |
| 5-pen | 0–30 | 709 | 39 | 5.5% |
| 5-pen | 30–60 | 601 | 19 | 3.2% |
| 5-pen | 60–90 | 327 | 6 | 1.8% |

## Rebound outcomes after saved shots

| config | outcome | count | share |
|---|---|---|---|
| 10-pen | loose | 1637 | 64.9% |
| 10-pen | skater control | 532 | 21.1% |
| 10-pen | goalie hold | 280 | 11.1% |
| 10-pen | whistle | 58 | 2.3% |
| 10-pen | nothing within 3 s | 6 | 0.2% |
| 10-pen | control: defence | 5 | 0.2% |
| 10-pen | shot by attacking team | 4 | 0.2% |
| 20-pen | loose | 3396 | 66.2% |
| 20-pen | skater control | 1013 | 19.7% |
| 20-pen | goalie hold | 536 | 10.4% |
| 20-pen | whistle | 124 | 2.4% |
| 20-pen | nothing within 3 s | 39 | 0.8% |
| 20-pen | shot by attacking team | 13 | 0.3% |
| 20-pen | control: defence | 10 | 0.2% |
| 5-pen | loose | 952 | 67.1% |
| 5-pen | skater control | 254 | 17.9% |
| 5-pen | goalie hold | 159 | 11.2% |
| 5-pen | whistle | 32 | 2.3% |
| 5-pen | nothing within 3 s | 10 | 0.7% |
| 5-pen | shot by attacking team | 6 | 0.4% |
| 5-pen | control: defence | 6 | 0.4% |

## Possession duration (real seconds per segment, distribution)

| config | owner | segments | median | p10 | p90 | mean |
|---|---|---|---|---|---|---|
| 10-pen | home | 7323 | 0.95 | 0.13 | 3.37 | 1.44 |
| 10-pen | away | 7550 | 0.95 | 0.13 | 3.45 | 1.45 |
| 10-pen | loose | 14173 | 0.28 | 0.03 | 3.32 | 1.14 |
| 20-pen | home | 14604 | 0.97 | 0.13 | 3.50 | 1.48 |
| 20-pen | away | 14930 | 0.93 | 0.12 | 3.47 | 1.44 |
| 20-pen | loose | 28178 | 0.28 | 0.03 | 3.42 | 1.15 |
| 5-pen | home | 4198 | 0.93 | 0.13 | 3.34 | 1.43 |
| 5-pen | away | 4188 | 0.93 | 0.12 | 3.42 | 1.43 |
| 5-pen | loose | 7977 | 0.27 | 0.03 | 3.43 | 1.13 |

## Manpower: goals and shots per 60 manpower minutes (scoring team's own state)

| config | state | game-minutes exposed (sum) | goals / 60 min [95% CI] | shots / 60 min [95% CI] |
|---|---|---|---|---|
| 10-pen | EV | 492.3 | 9.38 [7.55, 11.20] | 204.25 [194.42, 214.26] |
| 10-pen | PP | 188.5 | 7.64 [4.84, 10.74] | 218.95 [202.37, 235.51] |
| 10-pen | SH | 188.5 | 6.68 [3.84, 9.95] | 189.67 [176.06, 203.72] |
| 20-pen | EV | 954.5 | 7.54 [6.10, 9.00] | 206.31 [198.18, 215.18] |
| 20-pen | PP | 391.0 | 8.44 [6.04, 11.28] | 231.86 [217.03, 246.16] |
| 20-pen | SH | 391.0 | 6.44 [4.44, 8.61] | 178.46 [167.04, 190.11] |
| 5-pen | EV | 287.0 | 7.32 [4.86, 10.33] | 199.42 [187.50, 210.84] |
| 5-pen | PP | 100.9 | 13.67 [8.78, 19.42] | 239.60 [219.88, 261.25] |
| 5-pen | SH | 100.9 | 4.16 [1.30, 7.26] | 168.85 [151.16, 187.19] |

State rates use the scoring/shooting team's own manpower state, and pool both teams' exposure. Goal attribution depends on the shot match (see validation).

## Stoppage codes (labels not yet decoded)

Codes are the last whistle code from the penalty routine; stop-cause labels are still unverified (the stop read is unreliable per STUDY.md). Counts per 60 game-minutes:

| config | period | code | per 60 min [95% CI] |
|---|---|---|---|
| 10-pen | REG | 8 | 30.79 [28.36, 33.52] |
| 10-pen | REG | 16 | 11.94 [10.61, 13.39] |
| 10-pen | REG | 2 | 4.42 [4.18, 4.73] |
| 10-pen | REG | 14 | 7.03 [5.64, 8.42] |
| 10-pen | REG | 24 | 4.06 [3.27, 4.85] |
| 10-pen | REG | 6 | 4.36 [3.39, 5.33] |
| 10-pen | REG | 22 | 4.97 [3.88, 6.18] |
| 10-pen | REG | 30 | 2.79 [2.06, 3.64] |
| 20-pen | REG | 8 | 35.57 [32.52, 39.19] |
| 20-pen | REG | 22 | 5.53 [4.75, 6.49] |
| 20-pen | REG | 16 | 13.90 [12.51, 15.56] |
| 20-pen | REG | 14 | 7.10 [6.00, 8.29] |
| 20-pen | REG | 24 | 5.97 [5.11, 6.84] |
| 20-pen | REG | 2 | 2.37 [2.09, 2.76] |
| 20-pen | REG | 6 | 4.50 [3.67, 5.43] |
| 20-pen | REG | 30 | 2.83 [2.31, 3.37] |
| 5-pen | REG | 8 | 22.76 [19.06, 27.09] |
| 5-pen | REG | 16 | 9.07 [7.64, 10.82] |
| 5-pen | REG | 2 | 7.02 [6.72, 7.40] |
| 5-pen | REG | 14 | 4.80 [3.36, 6.73] |
| 5-pen | REG | 22 | 3.73 [2.70, 4.95] |
| 5-pen | REG | 24 | 3.82 [2.67, 5.17] |
| 5-pen | REG | 4 | 1.96 [1.33, 2.70] |
| 5-pen | REG | 30 | 2.13 [1.50, 2.83] |

## Figures (in E:/emu/work/analysis/G100v4-all\figures)

- `heat_shots_<cfg>.png`: shot-event locations, all teams, attacking-direction unfolded only as recorded.
- `heat_possession_<cfg>_<state>.png`: possession-segment locations by the owner's manpower state.
- Player-position heatmaps by role are NOT produced: the recorder logs no per-player positions by role yet (the traj line is not decoded). See the record-4 notes.
