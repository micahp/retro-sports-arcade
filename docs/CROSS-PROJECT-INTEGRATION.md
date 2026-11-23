# Cross-project reuse and provenance contract

Retro Sports Arcade is a **consumer of proven mechanics and evidence**, not a rewrite of the other projects. Before implementing an action, inspect existing code, tests, licenses, measured results and asset rights in each source repository.

## Source inventory (verified 2026-11-23)

| Project | Source | Reusable evidence | Boundary |
| --- | --- | --- | --- |
| [College Sports RPG / The U](https://github.com/micahp/college-sports-rpg/tree/docs/basketball-motion-library) | `docs/animation/BASKETBALL_LIBRARY.md`, `docs/animation/OWNERSHIP.md`, `data/animation/basketball_references.json`, `scripts/court/`, `tests/` | Action taxonomy, 201 reference clips, pose samples, retargeting and joint ownership failure cases, gameplay controls and Godot integration | The U uses Godot 4 typed GDScript, low-poly 3D, offline touch-first. Imported/candidate actions are **not validated**. Reference videos are links only, not redistributable assets. |
| [Gridiron Physics](https://github.com/micahp/gridiron-physics) | `docs/GRIDIRON-CONTRACT-v1.md`, `docs/NFL-HISTORICAL-REPLAY-VALIDATION-2026-10-24.md`, `docs/NFL-PLAYER-TRACKING-22-PLAYER-VALIDATION-2026-10-24.md`, `engine/`, `test/`, `web/` | Historical replay contracts, reducer patterns, physical action models, validation fixtures and football tracking benchmarks | Research-quality autonomous locomotion must beat trivial constant-velocity/acceleration references before adoption. A replay renderer is not proof of physical accuracy. |
| [Legendary Picks](https://github.com/micahp/legendarypicks) | `research/nhl/`, `research/nba-game-model/`, `research/tennis/`, NFL sequence and scoring research on development/research branches | Cutoff-safe data, game-state transitions, empirical action/outcome distributions, calibration and model evaluation | Do not require production DB access or expose private data in an arcade build. Statistical prediction accuracy and arcade fun are distinct gates. |

Other existing sports games, animation prototypes, wrestling mechanics, motion-capture pipelines and simulation branches should be added to the inventory **only after** their current paths, ownership, tests and rights are verified. Do not claim they are integrated based on a conversation summary.

## Concrete integration process

1. **Discovery:** search relevant source branches and identify the smallest existing implementation, dataset or validated test for the target mechanic. Record source repo, branch, immutable commit, path, action name, coordinate units, timestep, input/output and license.
2. **Classification:** mark each candidate `reference`, `candidate`, `imported`, `validated`, or `rejected`. Never silently promote a motion library's `imported` clip to `validated`.
3. **Contract:** adapt to `contracts/action.v1.json` for arcade actions, keeping the original source name and phase semantics. The game owns input/control; an action owns only declared joints and object/contact timing.
4. **Adapt, don't copy wholesale:** use a source adapter in the sport directory. Do not copy large tracking datasets, video, proprietary clips or whole physics engines into this repository.
5. **Benchmark:** compare against a fixed baseline and source fixture. For movement, report endpoint error, trajectory error, contact timing and team spacing when observed. For animation, verify rendered mesh and joint ownership. For game-state, verify event-by-event reducer invariants.
6. **Promotion:** only adopt when an isolated test and a full playable scenario pass. Preserve provenance and regression fixtures. Changes to source repositories require separate reviewed changes.

## Shared motion and action interfaces

- **Input intent:** move vector, facing/aim, action request, selected athlete, timestamp.
- **Sport adapter:** football run/cut, hockey skate/glide/brake, basketball stride/slide, wrestling step/lockup.
- **Action phases:** anticipate → execute → contact/release → recover, each with declared timing and interruptibility.
- **Object ownership:** possession changes only on a declared contact/release transition, not when a sprite or rig happens to overlap.
- **Animation ownership:** per action, specify clip-owned bones, procedural corrections, IK, root motion and the final pose owner. No layer may override another without an explicit handoff.
- **Output:** state delta, contact events, animation phase, reproducible replay log.

## The U lessons that must carry over

The U's `OWNERSHIP.md` identifies overlapping arm IK, clearance, hand aiming and elbow-hinge layers; an imported clip can look wrong even when retargeting is accurate. Its jump-shot review reports arms modified by later layers and a blend that replaces part of landing recovery. Its rebound entry still lacks a verified load, jump, landing and box-out sequence. **Do not repeat these mistakes in low-poly 3D.**

Use its action library and pose/reference taxonomy for basketball, but only use clips and animation data whose license and rendered quality have been verified. The U's game constraints explicitly separate data-driven simulation from the 3D world; preserve that boundary here.

## Immediate work packages

- **Reuse audit:** build a machine-readable manifest for The U, Gridiron Physics, Legendary Picks, and verified additional projects.
- **Hockey:** split the current browser prototype into a pure fixed-step state/reducer and presentation; add event/replay fixtures before Godot port.
- **Basketball:** make a playable micro-slice using The U's named actions, then test animation ownership on the actual rig before importing more actions.
- **Football:** implement one controlled movement/catch/tackle scenario; compare physics to constant-velocity and constant-acceleration baselines.
- **Wrestling:** verify any existing grapple prototype; otherwise specify paired-actor contact and recovery before authoring animations.
- **3D:** build one shared Godot athlete rig and action player, then independently validate skate, stride, turn, contact and recovery. Do not port all sports at once.

## Gate

An integration is not complete because it imports or renders. It must have a versioned provenance manifest, explicit action ownership, reproducible test, legal asset usage and a playable acceptance scenario.
