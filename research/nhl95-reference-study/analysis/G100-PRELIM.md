# NHL 95 Genesis recorder study — PRELIMINARY analysis

**Status: preliminary.** Built from 96 finished games in 3 period-length groups. Batch still running; no parameters are fitted from these results. Re-run `analyze_runs.py` on the full set to regenerate.

## Dataset

| config | games | seeds unique | start states | regulation shots (doshot) | mean real min/game |
|---|---|---|---|---|---|
| 10-pen | 32 | 32 | pd-10-pen-d7.state | 2881 | 20.6 |
| 20-pen | 31 | 31 | pd-20-pen-d7.state | 5628 | 39.9 |
| 5-pen | 33 | 33 | pd-5-pen-d7.state | 1593 | 12.1 |

## Validation checks

- ScoreSum goal count equals final score: 96/96 games.
- Goals linked to a shot event (approximate, 120 s window): 361/390 (93%). Scoring team and manpower state at the goal do not depend on the link.
- Period-quota leftovers (goals the period score says a team scored that could not be assigned): 4.
- Object-group mapping: group A (indices 0-5) = home (agreement score 8936; consistent with final shots).
- Shot events (doshot hook) vs final shot counters: 10102 vs 6876 (ratio 1.47). Shot-event totals are NOT the game's shot counter; the distance tables below use shot events.
- Shots more than 60 ft from the attacked net: 907/10102 (distance tables stop at 60 ft; a large share here would mean the attacking direction is wrong).
- Stoppage code 14 (AddPenalty2 call) occurs 389 times for 390 goals: it is the goal stoppage. Its puck position is where the goal went in.
- **Scoring team and manpower state at a goal: UNVERIFIED.** Goals attributed to power-play state total 40 against the game's own power-play goal counter total of 99. Neither index-to-team mapping reproduces the counter. The manpower-specific scoring table below is therefore not a finding yet.
- Rink zone boundary (blue line at 225 units) and attacking direction are assumptions, not yet verified in the render.
- Goalie object indices assumed to be 5 and 11 (observed as the save/contact targets).

## Goals per game, shots, and percentiles (per game, both teams)

| config | period type | goals mean [p10, p50, p90] | shot events mean [p10, p50, p90] |
|---|---|---|---|
| 10-pen | all | 3.72 [1, 3, 6] | 90.0 [79, 90, 99] |
| 20-pen | all | 6.74 [4, 7, 10] | 181.5 [161, 183, 201] |
| 5-pen | all | 1.88 [1, 1, 3] | 48.3 [39, 46, 64] |

## Rates per 60 game-minutes with 95% CI (games resampled)

| config | period | goals | shot events | penalties (both teams) |
|---|---|---|---|---|
| 10-pen | REG (n=32) | 7.06 [5.69, 8.44] | 174.56 [170.62, 178.81] | 19.69 [17.81, 21.69] |
| 10-pen | OT (n=7) | 14.34 [6.15, 40.65] | 210.36 [185.57, 267.72] | 43.03 [26.09, 50.31] |
| 20-pen | REG (n=31) | 7.36 [6.29, 8.59] | 195.54 [181.43, 213.64] | 24.29 [22.07, 26.88] |
| 20-pen | OT (n=6) | 4.11 [1.18, 8.79] | 209.59 [179.54, 240.66] | 24.66 [21.50, 28.41] |
| 5-pen | REG (n=33) | 4.64 [3.17, 6.53] | 127.55 [111.84, 148.00] | 16.27 [13.28, 19.80] |
| 5-pen | OT (n=11) | 13.00 [9.75, 20.45] | 224.56 [206.30, 242.75] | 26.00 [13.59, 41.35] |

## Shooting by distance and angle (shot events; goal = matched to a goal, saved = goalie touch in 3 s)

| config | distance (ft) | shots | goals | sh% [95% Wilson] | goalie touch (3 s) | other |
|---|---|---|---|---|---|---|
| 10-pen | 0–10 | 24 | 4 | 16.7% [6.7%, 35.9%] | 19 | 1 |
| 10-pen | 10–20 | 589 | 49 | 8.3% [6.3%, 10.8%] | 520 | 20 |
| 10-pen | 20–30 | 771 | 32 | 4.2% [3.0%, 5.8%] | 705 | 34 |
| 10-pen | 30–40 | 604 | 21 | 3.5% [2.3%, 5.3%] | 525 | 58 |
| 10-pen | 40–60 | 611 | 5 | 0.8% [0.4%, 1.9%] | 525 | 81 |
| 20-pen | 0–10 | 56 | 6 | 10.7% [5.0%, 21.5%] | 45 | 5 |
| 20-pen | 10–20 | 1160 | 72 | 6.2% [5.0%, 7.7%] | 1050 | 38 |
| 20-pen | 20–30 | 1585 | 58 | 3.7% [2.8%, 4.7%] | 1441 | 86 |
| 20-pen | 30–40 | 1127 | 32 | 2.8% [2.0%, 4.0%] | 981 | 114 |
| 20-pen | 40–60 | 1233 | 23 | 1.9% [1.2%, 2.8%] | 1046 | 164 |
| 5-pen | 0–10 | 16 | 2 | 12.5% [3.5%, 36.0%] | 13 | 1 |
| 5-pen | 10–20 | 342 | 26 | 7.6% [5.2%, 10.9%] | 303 | 13 |
| 5-pen | 20–30 | 449 | 12 | 2.7% [1.5%, 4.6%] | 421 | 16 |
| 5-pen | 30–40 | 289 | 8 | 2.8% [1.4%, 5.4%] | 260 | 21 |
| 5-pen | 40–60 | 339 | 2 | 0.6% [0.2%, 2.1%] | 291 | 46 |

| config | angle (deg from net-perpendicular) | shots | goals | sh% |
|---|---|---|---|---|
| 10-pen | 0–30 | 1275 | 70 | 5.5% |
| 10-pen | 30–60 | 1055 | 39 | 3.7% |
| 10-pen | 60–90 | 549 | 7 | 1.3% |
| 20-pen | 0–30 | 2393 | 114 | 4.8% |
| 20-pen | 30–60 | 2129 | 60 | 2.8% |
| 20-pen | 60–90 | 1097 | 20 | 1.8% |
| 5-pen | 0–30 | 689 | 30 | 4.4% |
| 5-pen | 30–60 | 579 | 14 | 2.4% |
| 5-pen | 60–90 | 321 | 7 | 2.2% |

## Rebound outcomes after saved shots

| config | outcome | count | share |
|---|---|---|---|
| 10-pen | loose | 1591 | 64.8% |
| 10-pen | skater control | 521 | 21.2% |
| 10-pen | goalie hold | 273 | 11.1% |
| 10-pen | whistle | 58 | 2.4% |
| 10-pen | nothing within 3 s | 6 | 0.2% |
| 10-pen | control: defence | 4 | 0.2% |
| 10-pen | shot by attacking team | 4 | 0.2% |
| 20-pen | loose | 3216 | 66.3% |
| 20-pen | skater control | 953 | 19.6% |
| 20-pen | goalie hold | 497 | 10.2% |
| 20-pen | whistle | 128 | 2.6% |
| 20-pen | nothing within 3 s | 37 | 0.8% |
| 20-pen | shot by attacking team | 13 | 0.3% |
| 20-pen | control: defence | 10 | 0.2% |
| 5-pen | loose | 927 | 67.0% |
| 5-pen | skater control | 245 | 17.7% |
| 5-pen | goalie hold | 156 | 11.3% |
| 5-pen | whistle | 33 | 2.4% |
| 5-pen | nothing within 3 s | 10 | 0.7% |
| 5-pen | control: defence | 6 | 0.4% |
| 5-pen | shot by attacking team | 6 | 0.4% |

## Possession duration (real seconds per segment, distribution)

| config | owner | segments | median | p10 | p90 | mean |
|---|---|---|---|---|---|---|
| 10-pen | home | 7099 | 0.95 | 0.12 | 3.35 | 1.43 |
| 10-pen | away | 7334 | 0.95 | 0.12 | 3.45 | 1.45 |
| 10-pen | loose | 13754 | 0.28 | 0.03 | 3.32 | 1.13 |
| 20-pen | home | 13763 | 0.97 | 0.13 | 3.49 | 1.48 |
| 20-pen | away | 14050 | 0.93 | 0.12 | 3.47 | 1.44 |
| 20-pen | loose | 26530 | 0.28 | 0.03 | 3.42 | 1.15 |
| 5-pen | home | 4094 | 0.93 | 0.13 | 3.34 | 1.43 |
| 5-pen | away | 4081 | 0.93 | 0.12 | 3.42 | 1.43 |
| 5-pen | loose | 7778 | 0.27 | 0.03 | 3.44 | 1.13 |

## Manpower: goals and shots per 60 manpower minutes (scoring team's own state) — UNVERIFIED goal attribution

Shot rates are usable with the caveats above. Goal rates by state are NOT, until the goal-to-team attribution matches the game's power-play counter.

| config | state | game-minutes exposed (sum) | goals / 60 min [95% CI] | shots / 60 min [95% CI] |
|---|---|---|---|---|
| 10-pen | EV | 480.9 | 11.85 [9.47, 14.24] | 204.74 [195.06, 214.90] |
| 10-pen | PP | 181.2 | 1.99 [0.34, 3.82] | 222.46 [207.09, 238.03] |
| 10-pen | SH | 181.2 | 5.96 [2.89, 9.38] | 188.03 [174.65, 202.50] |
| 20-pen | EV | 902.0 | 9.45 [7.63, 11.40] | 208.01 [199.44, 216.75] |
| 20-pen | PP | 365.7 | 4.27 [2.57, 6.23] | 229.52 [214.29, 245.20] |
| 20-pen | SH | 365.7 | 6.40 [4.39, 8.41] | 180.80 [169.61, 192.16] |
| 5-pen | EV | 279.1 | 10.10 [7.54, 13.44] | 197.75 [185.80, 208.80] |
| 5-pen | PP | 98.6 | 4.87 [1.85, 8.11] | 241.06 [220.89, 262.05] |
| 5-pen | SH | 98.6 | 3.04 [0.66, 5.70] | 168.62 [150.57, 187.09] |

State rates use the scoring/shooting team's own manpower state, and pool both teams' exposure. Goal attribution depends on the shot match (see validation).

## Stoppage codes (labels not yet decoded)

Codes are the last whistle code from the penalty routine; stop-cause labels are still unverified (the stop read is unreliable per STUDY.md). Counts per 60 game-minutes:

| config | period | code | per 60 min [95% CI] |
|---|---|---|---|
| 10-pen | REG | 8 | 30.75 [28.19, 33.69] |
| 10-pen | REG | 16 | 12.00 [10.56, 13.44] |
| 10-pen | REG | 2 | 4.44 [4.19, 4.75] |
| 10-pen | REG | 14 | 7.06 [5.69, 8.44] |
| 10-pen | REG | 24 | 4.00 [3.25, 4.81] |
| 10-pen | REG | 6 | 4.31 [3.38, 5.38] |
| 10-pen | REG | 22 | 4.94 [3.81, 6.25] |
| 10-pen | REG | 30 | 2.88 [2.19, 3.69] |
| 20-pen | REG | 8 | 35.43 [32.33, 39.02] |
| 20-pen | REG | 22 | 5.50 [4.62, 6.50] |
| 20-pen | REG | 16 | 14.04 [12.53, 15.81] |
| 20-pen | REG | 14 | 7.32 [6.28, 8.55] |
| 20-pen | REG | 24 | 6.11 [5.26, 6.96] |
| 20-pen | REG | 2 | 2.39 [2.10, 2.77] |
| 20-pen | REG | 6 | 4.64 [3.74, 5.62] |
| 20-pen | REG | 30 | 2.86 [2.31, 3.40] |
| 5-pen | REG | 8 | 22.45 [18.87, 26.90] |
| 5-pen | REG | 16 | 9.18 [7.67, 10.86] |
| 5-pen | REG | 2 | 7.00 [6.69, 7.38] |
| 5-pen | REG | 14 | 4.64 [3.17, 6.53] |
| 5-pen | REG | 22 | 3.73 [2.72, 4.98] |
| 5-pen | REG | 24 | 3.91 [2.71, 5.30] |
| 5-pen | REG | 30 | 2.18 [1.55, 2.91] |
| 5-pen | REG | 4 | 1.91 [1.28, 2.74] |

## Figures (in E:/emu/work/analysis/G100-prelim\figures)

- `heat_shots_<cfg>.png`: shot-event locations, all teams, attacking-direction unfolded only as recorded.
- `heat_possession_<cfg>_<state>.png`: possession-segment locations by the owner's manpower state.
- Player-position heatmaps by role are NOT produced: the recorder logs no per-player positions by role yet (the traj line is not decoded). See the record-4 notes.
