# Mechanics comparison matrix: NHL 95 (Genesis) → Rink '95

**Evidence ranks.** The first two are primary; the last two are interpretation only.
1. **Source:** the reverse-engineered Genesis source (`GENESIS-ROUTINES.md`), instructions read directly.
2. **Emulator:** measured from the user's ROM in BizHawk (`STUDY.md` §3, recorder in `E:\emu\work`).
3. **Manual:** the EA manual (`STUDY.md` §1).
4. **Community:** player observations from the Segathon strategy guide (see references). Never a basis for a mechanic on its own; each community claim is checked against the source or the emulator.

**Status of the "NHL 95" columns:**
- *read*: confirmed in the instructions;
- *unconfirmed*: a claim not found where expected;
- *to measure*: an emulator test is listed.

| # | Mechanic | Genesis source | Observed / reported behaviour | Rink '95 now | Missing | Proposed test |
|---|---|---|---|---|---|---|
| 1 | **Player ratings** | 15 ratings per skater: roster value × 5, plus hot/cold ÷ 3, clamped to 0–30 (`AttributeCalc`, read). Situational bonuses: PP, PK, home/away, 3rd period trailing or tied (`setplayer`, read). | Community: speed, agility, stickhandling, shot power and accuracy matter most; hot/cold up to ±10%, uncertain. | A few ratings scale speed and shot strength slightly. | Rating-driven AI, bonuses, hot/cold | Emulator: read hot/cold bytes (team block +$1A4) across many games for their real range |
| 2 | **AI decision cadence** | Offensive awareness gives a countdown of ~7–15 frames between offensive decisions; defensive awareness ÷ 2 on defence (`asspuckc`, `assdefd`, read) | — | Fixed 0.15 s for the carrier; **every frame** for checks and pokes | Per-player cadence | Unit test in Rink '95: decision interval tracks the rating |
| 3 | **Carrier: shoot** | Inside ~100 units (≈10 m): about 8/(17–32) per decision by shoot-vs-pass bias. **Each opponent in the lane doubles the odds against.** Outside: about 16× rarer. Empty net: always. CPU teams run the shot check on about half the decisions (`chk4shot`, read). | Community: blue-line slap shots almost never score; one-timers are the main threat. | 45% inside 8 m, 12% at 8–17 m; no lane check | Lane blocking, shooter bias, empty-net rule | Emulator: shots per game vs goals; Rink '95 paired-seed run with lane halving (follows DIAGNOSIS E2) |
| 4 | **Carrier: under pressure** | Opponent within ~20 units of the next position → on 1 tick in 4, **clear from its own end, otherwise pass** (`chk4shot`, read) | — | Keeps carrying | Pressure response | Rink '95: possession-end mix (hit and poke turnovers should fall) |
| 5 | **Pass selection** | **One random teammate** per tick. Rejected if: unavailable, offside, too far back in its own zone, or **an opponent nearer in the same 8-way direction**. Unthreatened carriers pass only sometimes (`chk4pass`, read). | Community: pass speed looks the same for every player; the passing rating may set how often the AI passes. **Source: the pass decision uses the shoot-vs-pass bias, not the passing rating.** | Lead pass to the best-scored teammate; no lane rule | Lane-clear rule; random target | Rink '95: interception share (27% now) under the lane rule |
| 6 | **One-timers** | Computer receivers one-time passes in the attacking zone (`asspassrec` → `assonetimer`, label, not yet read) | Manual: B then C. Community: centres take about 95% of one-timers; even weak players get a boost. | None | One-timer | Read `assonetimer`; emulator: share of goals off a pass within 0.5 s |
| 7 | **Checking** | Roll about 7/(40 − checking) per decision tick, **halved with penalties On**. Target within ±30 units, in the exact 8-way facing direction. Speed burst, or a hook ("A") check in the slot or 1 time in 4 (`check4check`, read). | Community: big slow players check weakly without a running start; hitting a non-carrier is not penalised. | 12% per frame on closing speed; 255 attempts a game | Rating, facing rule, decision cadence, penalties-on halving | Emulator: hits per game, penalties On vs Off; Rink '95 E6 |
| 8 | **Defencemen** | Base `assdefd`: LD and RD mirror each other. Each holds his side at x = ±65, about 50 units ahead of the deepest attacker, and moves to the middle when the puck is on the far side (read). Team defence mode 1 → `assdefdchase` (not yet read). | Community: **LD chases, RD stays in front of the net.** *Unconfirmed* in `assdefd`; check `assdefdchase` and `assnearest`. | Role slots; one chaser | Possibly the LD/RD asymmetry | Read `assdefdchase` and `assnearest`; emulator: LD vs RD distance to net while defending (needs player position addresses) |
| 9 | **Goalie positioning** | Predicts where and when the puck crosses the goal line (`findpc`), and plays that point (read). | Community: auto goalies give up cross-crease goals easily; goalies are twice as wide as in NHL 94. | Plays the puck's current position; save decided by lateral distance | Crossing-point prediction | Rink '95 E4: phantom saves should go to 0% |
| 10 | **Save outcome** | `goaliesave` chooses the animation by height, side, timing and hand. The stop itself is collision-based (`collide95`, not yet read). | Community: a slow tap can slip between the legs; rebounds off the goalie can leave an open net. | Probability by distance and speed | Animation-shaped save areas | Read the goalie–puck collision code |
| 11 | **Shot blocking** | Joystick skaters can drop to block (`CanBlock`, label) | Manual: A in the defensive zone. Community: the CPU uses laydown blocks well. | None (16% blocked vs NHL 28%) | Shot block | Read `CanBlock` and the CPU's use of it |
| 12 | **Penalties** | Infraction list including tripping with a penalty-shot variant (`penalty95`, not yet read) | Manual: On / On except offsides / Off; PP goal releases a player. Community: on the penalty kill, the RW leaves first, the LW on a second penalty. | 4 infractions, placeholder odds, proportional length | Penalty shots, who leaves the ice, real length | **Phase C running**: penalty length in game seconds at 5/10/20 min |
| 13 | **Icing / offsides** | Checked on the puck itself (`pucknorm`, `a2offsides`, label) | Manual: icing always called | None (10 faceoffs a game) | Both | Emulator: whistles per game; Rink '95 faceoff count |
| 14 | **Pulled goalie** | Pull when trailing by 2 late in the 3rd, or on a delayed penalty (`CPgoalie`, label) | — | Empty-net mode only, by hand | Automatic pull | Read `CPgoalie` |
| 15 | **Game clock** | Period length in seconds (`PerTimeTotal`) | **Emulator:** about 2.43 game seconds per real second while running, at every length; stopped 22–35% (penalties off) or 32–45% (on); OT counts down from 10:00 | Clock runs at real speed during play | Choice of a clock-speed policy | Phase B: same ratio at 5 and 20 min? |
| 16 | **Scoring rate** | — | Emulator, 1 game: 7 goals, 79 shots in 36.5 game-minutes | 7.3 goals in 9 minutes | — | Phase C distributions |

## Primary next reads in the source
- `assonetimer` (6)
- `assdefdchase` and `assnearest` (8)
- goalie–puck collision in collide95 (10)
- `CanBlock` (11)
- penalty95 (12)
- `pucknorm` (13)

## References added for this study
| Source | URL | Evidence type | Use |
|---|---|---|---|
| Segathon, "NHL 95 Strategy" (no author named; © 2015; "updated numerous times") | https://www.segathon.com/nhl-95-genesis-strategy/ | **Community gameplay observation.** Some claims are presented as certain, some as impressions; one is credited to an NHL94.com member. | Hypotheses to check against the source and emulator; never a primary basis |
| NHL-95.com team pages, e.g. Philadelphia | https://nhl-95.com/teams/philadelphia-fliers.php | **Roster data**, community-compiled. Origin not stated; columns (OR AG SP PO AC SH …) are not defined on the page. | Test cases for rating-dependent behaviour, **after** checking the values against the ROM's roster data, which the source can decode |

The two community claims checked so far:
- **Ratings "×5 then randomised":** confirmed in form. The roster value × 5 plus hot/cold ÷ 3, clamped to 0–30.
- **"LD chases, RD stays home":** not present in the base defensive routine; still open.
