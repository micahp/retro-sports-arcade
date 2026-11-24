# Hockey action catalog — NHL 95 (Genesis) as behavioural reference

Read-only audit of `frames95.asm`, `display95.asm`, `middle95.asm`, `skate95.asm`,
`input95.asm`, `collide95.asm`, `logic95.asm` (13.9k lines), plus animation tables
extracted from the ROM image and ram captures from BizHawk.

Nothing in this document copies sprites, graphics, assembly or hotspot tables. The
original-game captures and the raw extracted tables stay local,
(`E:\claude-work\nhl95-study\`, `E:\emu\work\capture\`). What is recorded here is
behaviour: which routine fires which animation, for how long, in which direction,
and under which gameplay condition.

Machine-readable form: `games/hockey/data/hockey-actions.v1.json`.

## Confidence policy

Every claim carries one of:

- **verified** — forced by the instructions, or measured from the ROM/emulator.
- **inferred** — depends on the decompilation project's routine names, field names or
  comments, or two instructions contradict each other.
- **validated** — requires *both* a visual reference comparison *and* a playable
  gameplay test. **Nothing in this catalog is validated yet.**

## Method, and why the ROM is the source of truth

Text parsing of `frames95.asm` was lossy (multi-row direction blocks lost pairs), so
animation tables are extracted directly from the ROM image instead. Layout verified
three ways:

1. `SPAlist = $5A34`, first table at `+2` (a `dc.w 0` precedes it).
2. Each table is a 9-word header — 8 direction offsets relative to the table start,
   then the attribute word — which the disassembly itself addresses as `$10(a0)`.
3. 25+ animation ids observed in the running game match the extracted offsets
   exactly (`glide=2908`, `turnl=3008`, `stop=3336`, `passf=4962`, `shotf=5386`,
   `skateback=6610`, `gready=7034`, …).

Timing comes from `display95.asm:updateanim` (read in full):

- `SPAnum` is a **byte offset**, +4 per (frame,time) pair.
- A **negative** time is the terminal pair; its magnitude is the hold on that frame.
- Attribute (table `+$10`): bit 0 = loops, bit 1 = loop to pair `(attr>>8)*4`,
  i.e. the high byte selects a pair index. Neither set = the animation ends and
  `SPA` is cleared.
- Direction = `facedir` 0–7, x-flipped as `(8-facedir)&7` when the *struct*
  attribute (`$4`) bit 3 is set.
- Frames are **60 Hz**; a sprite frame cannot change more than once every 4 frames
  (`glitch`, ≈67 ms) except on the first frame.

## Catalog

| Action | SPA (offset) | Cycle | Dirs | Loop | Trigger routine | Conf. |
|---|---|---|---|---|---|---|
| Ready (goalie) | `gready` 7034 | 580/700 f | 8 | yes (bit 0) | GoalieReadySPA | verified |
| Ready (skater) | SPA 0 (default glide frame) | — | 8 | — | — | verified |
| Forward skate | `skate` 1062 | 168 f (2.80 s) | 8 | no | playeracc | verified |
| Forward skate + puck | `skatewp` 1848 | 168 f | 8 | to pair 16 | playeracc carrier branch | verified |
| Glide / +puck | `glide` 2908 / `glidewp` 2958 | 8 f hold | 8 | no | playeracc | verified |
| Turn left / right | `turnl` 3008 / `turnr` 3090 | 8 f | 8 | no | noturn / noturn0 | inferred |
| Turn +puck | `turnlwp` 3172 / `turnrwp` 3254 | 8 f | 8 | no | noturn carrier | inferred |
| Stop / +puck | `stop` 3336 / `stopwp` 3418 | 8 f | 8 | to pair 1 | dostop / stopna | verified |
| Backward skate | `skateback` 6610 | 48 f (0.80 s) | 8 | no | playeracc via pfrev | verified |
| Backward glide | `glideback` 9572 | 8 f hold | 8 | no | playeracc | verified |
| Speed burst | `burst` 788 / `burst2` 4526 | 48 f / 24 f | 8 | no | burstchk (C, no puck) | verified |
| Pass forehand | `passf` 4962 | 28 f (0.47 s) | 8 | no | doinput B → dopass | verified |
| Pass backhand | `passb` 5158 | 28 f | 8 | no | Findhittype backhand cone | verified |
| Drop pass | `droppass` 5076 | 24 f | 8 | no | GameFlags bit 1 | verified |
| Receive | `catch` 9218 | 12 f (0.20 s) | 8 | no | asspassrec / puckbody | verified |
| Wrist shot | `shotf` 5386 | 52 f (0.87 s) | 8 | no | SetShotMode → doshot | verified |
| Backhand shot | `shotb` 5998 | 26 f | 8 | no | same, backhand | verified |
| Fake shot | `fakeshotf` 5692 / `fakeshotb` 6304 | 32 f | 8 | no | release deep instead of shooting | verified |
| One-timer | `shotf`/`shotb` | freeze at pair $18 | 8 | no | assonetimer | verified |
| Body check | `burst2` 4526 | 24 f | 8 | no | CCStart | verified |
| Hold / hook | `Hold` 3600 / `hook` 3700 | 30 f | 8 | no | Holdplayer (A, no puck) | verified |
| Hold2 / hook2 | 3650 / 3750 | 55 f / 48 f | 8 | no | contact resolution | verified |
| Sweep check | `sweepchk` 3896 | 16 f | 8 | no | B tap on current skater | verified |
| Fall forward / back | `fallfwd` 4010 / `fallback` 4252 | 144 f / 152 f | 8 | no | FallDown | verified |
| Stumble / flip | `stumble` 6820 / `flip` 8472 | 30 f / 130 f | 8 | no | weak hit / hard hit | verified |
| Faceoff | `faceoff` 6966 | 18 f | **2** (0,7) | no | faceoff code | verified |
| Celebrate / pump | `pump` 8974 etc. | 72 f | 8 | no | assscore | verified |

Frame indices and durations for every row are in the JSON (`timing.pairs`).

## Vertical-slice actions in detail

### 1. Ready stance
Goalie ready loop is 180 frames on one sprite, a 3-sprite blink/shuffle of 10 frames,
340 frames held, then again reversed — 580 frames total (9.7 s), looping. This is the
idle anchor: it is *long*, so treating it as a one-shot clip would cut the stance off
after a second. Skaters have **no** ready animation: `SPA` stays 0 and the default
glide sprite is drawn. Reproducing that matters — a skater forced into a breathing
idle reads as a different game.

### 2. Forward skating without the puck
Three stride rows of eight sprites each: 8 frames per sprite, then 7, then 6. Full
cycle 168 frames = 2.8 s. Acceleration is `dirtab[dir] * ((($60 - weight>>2) + legstr)>>1) >> 5`,
multiplied by frames elapsed; `dirtab` is 240 straight / 169 diagonal. Top speed is
capped at `((rating+20)*325)^2` with the rating derived from `legspd` and energy
(halved for a goalie, eighth for an injured player).

### 3. Forward skating with the puck
Same 168-frame cycle with different sprites, but attribute `$1003` sets both loop bits
and a loop target of **pair 16** — so after the first two stride rows the carrier
stays in the fast 6-frame row. The carrier variants replace *every* locomotion table,
not just the skate: glide, turn and stop all have `wp` twins.

### 4. Backward skating
`pfrev` (pflags bit 4) routes through `noturn`, which feeds `playeracc` `facedir^4`:
travel opposes facing, so the defender skates backwards while still facing the play.
48-frame stride cycle at 8 frames per sprite, six sprites.

### 5. Turning and stopping
Turn is a two-pair shuffle (4+4 frames): the *engine* rotates `facedir`, the sprite
only sells the edge. Turning requires `facedir != inputdir` and a speed gate
(`speed²>>16 > $14`), with the side chosen from `turnstep = [0,$10,$10,$10,0,-$10,-$10,-$10]`
XOR the struct flip bit.

Stop is a two-frame rock (`73,74`) looping back to pair 1. `dostop` fires when the
input has no direction while moving, or when travel is within `+2` of facing. Below
`±$1000` on both velocity axes the game uses `stopna` instead and **does not change
the animation at all** — the skater just decelerates. That distinction is why a naive
"stopped => stop animation" mapping looks wrong.

### 6. Passing and receiving
The puck leaves on **release**, not on press: B enters pass mode, the dpad aims,
release launches, and `st (puckc)` clears the carrier in the same instruction stream.
`SPApassf` is three poses (4+4 frames) then a 20-frame hold = 28. There is **no
reception animation for the stick**: `SPAcatch` is the *body*-caught-puck animation.
Reception is assignment `$D` (`asspassrec`), which hands control back to a human or
escalates to a one-timer for a CPU receiver. Our implementation should therefore
separate "catch with the stick" (possession transfer + a short settle) from
`SPAcatch`, which we can use for a body block.

### 7. Wrist shot
Nine 4-frame poses then a 20-frame hold = 52 frames (0.87 s). Charge is 16 frames;
the earliest legal release is frame 8 (unless `shotspd >= $14`), forced at frame 28.
Sprite frames walk 450→448 (wind-up) then 448→453 (follow-through and release). The
puck leaves with `nopuck = $10` and `ShotTimer = $1E`.

Phases used by our action contract: anticipate 0–8, execute 8–20, contact 20–24,
recover 24–52 (frames).

## Contact events and geometry

Original game, verified from `collide95` + `middle95`:

- Contact point is `(Xpos + hotx, Ypos + hoty)`, taken from `HotList` indexed by the
  **sprite frame field** (`$6`) — *not* by `SPAnum`, and with **no `facedir`
  rotation**. `hotx` is negated when struct attribute bit 3 is set, `hoty` when bit 4 is.
- The test is an axis-aligned box of ±`ChkStickP`: **14** units normally, **18**
  during a one-timer (with the hotspot halved).
- Gates: `Zpos <= 5`, `Zvel <= $200`, `nopuck == 0`.
- Catch threshold `((Stk*$15E)+$32C8)^2`; steal radius `$40`, slot `$24`.
- **`puckbody` is dead code**: `collide95:1182` uses `move.w` where `cmp.w` belongs,
  so the `blt` always exits. Body-caught pucks do not exist in the shipped game.

Our rig cannot use a per-sprite-frame hotspot table (there are no sprites), so the
contact geometry is derived from the rigid blade segment:

```
shaft 1.52 m, blade heel->toe 0.30 m, blade 11 mm thick, shaft radius 17 mm
top hand 0.06 m from the butt, bottom hand 0.36 m from the butt
puck radius 38.1 mm, shot sweet spot 0.62 along heel->toe
contact radius = blade half-thickness + puck radius
```

The original's 14-unit box is kept as the contact radius budget rather than a box.

## Defects this catalog forced into the open

1. **The stick in the current build is not a stick.** The drawn stick is a visual
   solution with a chain of shrinking heuristics; the *physics* stick (`H0/E0`) is a
   separate blade jutting perpendicular to the shaft. Measured: the physics contact
   point sits **0.15–0.43 m from the drawn blade**, and the bottom hand floats
   **0.47–0.81 m off the shaft**. Fixing this is the prerequisite the brief named, and
   it is now implemented in `games/shared/stick/stick.js` + `games/shared/rig/ik.js`
   (see that module's tests).
2. **Turn gates contradict each other** in `skate95` (needs `d3>$14` at :807 and
   `d3<=2` at :830). The animation is observed running in the emulator, so one of the
   two readings is wrong; do not adopt the threshold until it is resolved.
3. **`check4check` always bursts** because `vtoa` overwrites `d1`, making the
   hook/hold branch dead code. Hook/hold only arrive from `check4check2`.
4. **`SPApump/2/3` are goal celebrations, not dekes.** An earlier note in this repo
   said otherwise; corrected.
5. **Velocity units are unresolved.** `pos += vel*17*33/32` per frame disagrees with
   the `$1000` / `$7D0` / `$96` stop constants. No m/s figure is claimed anywhere.

### 6. Moving contact to the real blade changes shot outcomes (measured)

With the shared rigid stick wired into `poses.js`, `bladeOf()` now returns a point on
the drawn blade instead of the old sideways stub. A/B on the puck suite:

| build | goalie save scenario |
|---|---|
| old two-stick geometry | saved 100% at the goalie, 23% at the corner (pass) |
| rigid stick, real blade contact | saved 10% at the goalie, 10% at the corner (fail) |

The blade's authored path is the cause, not the contact maths: at release the heel
sits at y=0.06 while the pose's ground reference is y=0.18, so the shot spawns from a
point that was never designed to be the puck's origin. The old code hid this because
contact came from a body-relative stub that ignored the authored blade entirely.

This is the first thing the action contract has to fix: **the release frame's blade
point must be the puck's contact point, on the ice, and every shot action re-anchored
to it.** Until then the physics baselines are stale. Do not "fix" this by relaxing the
save-rate assertion.

## Validation gate

An action is `validated` only when both hold:

1. **Visual reference comparison** in Player Lab: the captured NHL 95 clip and our
   animated action side by side, synced, frame-steppable, with contact markers and a
   movable camera.
2. **Playable gameplay test**: the action executed in the game from real input, not
   from a test harness calling the pose function.

Numerical assertions (rigid shaft, hands on shaft, toe forward, blade on the ice,
contact point on the blade segment) are necessary but **not sufficient** and never
promote an action on their own.

Current status of the seven slice actions: **catalogued, none validated.** The shared
stick/IK layer passes its geometry tests; the actions, the Player Lab and the
playable test are not built yet.
