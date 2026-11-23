# Retro Sports Arcade

A mechanics-first sports game studio sandbox. The first playable vertical slice is **Rink '95**, an original top-down three-on-three hockey game inspired by the readability and responsiveness of mid-1990s arcade sports games.

## Play

Open `index.html` in a modern browser, or serve the repository locally:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

No build system, game engine installation, assets, external API, or database required.

**Controls:** WASD or arrow keys to skate; Space to shoot while carrying the puck or poke-check without it; J to pass; Tab to switch to the nearest blue skater; P to pause. On touchscreens use the on-screen direction and action buttons.

**Rules in this slice:** three blue skaters and three red skaters plus goalies; blue attacks right; three two-minute periods; goals restart at center; score is tracked. This is a small original arcade ruleset, **not** NHL rules compliance. There are no penalties, offside, icing, line changes, overtime, shootouts, authentic rosters, or seasons yet.

## Engineering principles

1. **Playable before predictive.** Input responsiveness and coherent gameplay must pass before graphics fidelity increases.
2. **Simulation is not animation.** Visual fidelity cannot repair incorrect locomotion, interactions or decisions.
3. **Replays are explicit.** Historical event replay and autonomous simulation are different products with different evidence.
4. **Do not claim physics accuracy from appearance.** This prototype uses simple damped steering, puck velocity and discrete possession. It is not a validated hockey biomechanics model.
5. **Keep sport rules distinct from shared interfaces.** Hockey skating and football running may implement the same command protocol, but must not share inappropriate dynamics.
6. **No licensed teams, league logos or player likenesses.** Use original branding until rights are cleared.

## Roadmap

### R0: playable original hockey vertical slice (current)
- Three-on-three arcade loop, puck possession, passing, shots, goalies, basic defensive AI, scoreboard, periods, keyboard and touch controls.
- Lightweight canvas rendering without external dependencies.
- **Known limitations:** AI decision quality, no explicit shot event ledger, no tests, no audio, no persistent game results, no real rules enforcement, and no replay serializer. This is a prototype, not a finished game.

### R1: reliable hockey mechanics
- Extract pure deterministic fixed-step state/reducer from rendering and input. Seed all randomness.
- Add event log, replay/recording, golden fixtures and independent invariant tests.
- Introduce stoppages, faceoffs, shot/save attribution, puck recovery and controlled goalie behavior.
- Test collisions, boundary behavior, score transitions and clock correctness.
- Gameplay acceptance: complete matches without illegal score/state transitions, no stuck puck, no nonresponsive input.

### R2: animation-quality gate
- Define action/pose contract: idle, accelerate, glide, turn, brake, pass, windup, release, save, check, fall, recover.
- Start with readable 2D sprites; use directional animation sheets, anticipation/contact/recovery frames and correct object timing.
- Measure foot/skate sliding, action latency, contact separation and trajectory error against simple constant-velocity baselines.
- Historical motion research is reference evidence, not runtime ground truth.

### R3: low-poly 3D
- Build a Godot proof-of-concept with a single reusable rig, curated animation clips, and deterministic input/state playback.
- Retarget validated action clips; avoid root-only jumps, teleporting possession, and unverified procedural rigging.
- Keep the 2D game playable as a regression reference.

### R4: additional sports
- Basketball: 3v3 arcade slice; dribble, pass, shot, contest, rebound and box-out.
- Football: small-sided arcade slice; routes, throw/catch, blocking and tackling.
- Wrestling: one-on-one slice; grapple, strike, counter, throw, pin and recovery.
- Share control commands, replay format, animation states and quality checks, **not** one universal physical motion model.

## Integration boundaries

- **Legendary Picks:** data, historical game-state reconstruction, statistical modeling, source provenance.
- **Gridiron Physics:** experimental physics, trajectory and reconstruction research, independently evaluated.
- **Retro Sports Arcade:** playable games, player controls, animation authoring, game-feel and product development.

No external repository is a runtime dependency. Any future integration must use versioned contracts and separate evidence from inferred states.

## Evaluation gates

| Gate | Evidence |
| --- | --- |
| Playability | Input latency, full match completion, fun and intelligible controls |
| Rules | Valid scoring, restarts, clock, roster and action invariants |
| Motion | Acceleration/turning and contact timing; compare to trivial movement baselines |
| Animation | Explicit windup/contact/recovery, no floating or object teleportation |
| Simulation | Event/state distributions against held-out observed sports data |

Passing one gate never implies passing the others.
