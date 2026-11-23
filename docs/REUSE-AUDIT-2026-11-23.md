# Cross-repository reuse audit (2026-11-23)

This is the first pass of the **Reuse audit** work package in `CROSS-PROJECT-INTEGRATION.md`.
- **Machine-readable manifest:** `manifests/reuse/REUSE-MANIFEST.v1.json`, 21 entries, each with a pinned commit, path, status, evidence and boundary.
- **The U motion-reference detail:** `manifests/reuse/the-u-motion-reference.v1.json`.

**Method:**
- Every repository was freshly cloned from GitHub on 2026-11-23.
- Tests were re-run where the toolchain exists on the audit machine: Godot 4.7.2, Node 24, Python 3.14.
- Anything not re-run is marked *read only*.
- Nothing is promoted beyond `candidate`.

## Answers first

1. **The biggest reuse is in Gridiron Physics, not The U, because it's the same stack.** `feat/basketball-action-library` has a browser-JS constrained action library (`web/basketball/`) and a contact, foot-lock, IK and tackle layer (`web/mesh/`). Their tests pass. It already fits the `action.v1` idea: the caller names an action and a time, and the library owns the joints and the contact timing.
   - The U's equivalent is Godot GDScript. It's only directly useful at R3.
   - The branch is unmerged: 94 commits ahead of Gridiron `main`.
2. **The best hockey reuse is in Legendary Picks:**
   - an NHL rules validator with official-game fixtures;
   - real shot-to-recovery rates from Big Data Cup tracking;
   - a finding that team-level rates beat player-level models.
3. **Hockey R1 can adopt `engine/rng.js` from Gridiron today.** It's a 24-line seeded PRNG, and it removes the arcade's 4 unseeded `Math.random` calls.
4. **Legendary Picks already designed a retro football arcade** (Pixel Red Zone, Kicking Camp drills, verified ESPN event adapter), on `feat/pixel-nfl-hq-design`. Decide who owns football arcade before building another.
5. **Two "integration" assumptions in the spec were wrong:**
   - The U's motion library is on a docs branch, not `dev`, and its clips are local-only.
   - The U's GitHub default branch `main` is 39 commits behind its integration branch `dev`. Always pin `dev`.

## Test results re-run in this audit

| Repo @ ref | Suite | Result | Note |
|---|---|---|---|
| college-sports-rpg @ dev `3104246` | court_checks | pass | |
| | rebound_checks | pass (0 failures) | |
| | swipe_checks | pass | |
| | court_runtime_qa (`--fixed-fps 60`) | **2 of 25 segments fail** | known failure in its AGENTS.md (calib: walk, loco: idle pops) |
| | swipe_pose_checks | **fail, 0 of 36** | known: no poke lands |
| | contest_pose_check | pass (0 failing arm-frames, frames 40-66) | |
| | clip_fidelity | **fail: 14 unauthorized modifier/bone pairs, 10 owned bones past limit** | known: shooter arms (elbow_hinge 123.9 deg on RightUpperArm, hand_aim 67.6 deg on RightHand) |
| | jumpshot_fidelity | report only | source to drawn at the gather (0.37 s): trunk pitch 26.3 deg, chest pitch 44.3 deg off the recording; blending alone adds 15-25 deg |
| | smoke, season_checks, season_flow_checks, torso_posture_checks | pass (8, 152, 69 checks; 0 failures) | |
| gridiron-physics @ main `623c049` | test/validate.mjs --strict | pass | |
| | test/prototype.mjs | **fail** | `TypeError: book.pregame_2026_comparison` undefined |
| | npm run test:autonomous | pass | |
| | npm run test:week7 | **fail: 10 mutations survive** | kickoff/safety/blocked-punt spot rules not proven by the audit |
| gridiron-physics @ feat/basketball-action-library `49c4000` | library, actions, skeleton, sprite tests | pass | |
| | rigged-animation-unit, rigged-player-unit, rigged-animation-controller, ghost-contact | pass | |
| | tools/validate-locomotion.mjs | pass: all gaits under 10 cm slide per plant | carry 2.5-3.2 cm, backpedal 7.7-8.5 cm |
| | tools/validate-tackles.mjs | runs; **foot slide median 0.21 m, max 0.60 m; peak root speed 12.8 m/s** | measurements, not a pass gate: open defects |
| legendarypicks @ dev `14bacb1a` | research/nhl/game-rules-gate1 tests | **14 of 18 pass, 4 error** | the 4 need `/root/lp-data/...` manifests from the LP data machine |

The U's failures match the "Known failures" list in its `AGENTS.md` exactly, so no new regressions turned up. They are still failures, and the arcade must not inherit them as baselines.

## Recommended first moves per work package

| Work package | Reuse | Status after this audit |
|---|---|---|
| **Hockey R1** (reducer, seeded, invariants) | `gp.rng` (seed), `lp.nhl.rules-gate1` (port the center-faceoff-after-goal and restart checks as JS invariants on the event log), `gp.autonomous` *pattern* only (one whistle, event log reconciles to result, frame determinism tests) | candidate |
| **Hockey AI tuning** | `lp.nhl.shot-rebound-tracking`: about 52% of attempts recovered within 3 s (295 shooting team / 326 opponent of 1,190), 15% get a follow-up shot within 5 s; `lp.nhl.full-game-sim`: tune to team-level rates; `nhl-dataset` shot locations | reference |
| **Hockey motion (R2)** | No hockey motion library exists anywhere. Big Data Cup tracking is the only real skater and puck speed source found. The `tools/reference/` pose pipeline in The U can build a hockey clip library the same way the basketball one was built. | gap |
| **Basketball micro-slice** | `gp.basketball-web` + `gp.mesh-contact` (same stack); The U `assets/court/sprites/meta.json` (per-frame hand positions for 2D possession); `csrpg.motion-reference` for taxonomy and timing | candidate |
| **Football slice** | `lp.pixel-red-zone` (existing retro football arcade design and verified-event adapter), `gp.team-movement-priors` (role prior 0.79 m beats constant acceleration 1.07 m at 1 s), `gp.playbooks`, `gp.slc-2d-replay` | candidate / reference |
| **Wrestling** | `gp.mesh-contact` pair/contact/tackle fall directions are the only paired-actor contact code found | candidate |
| **3D (R3)** | `csrpg.court-actor` + `csrpg.court-assets` (CC0 Quaternius, CMU) as the reference rig, with `csrpg.ownership` as the rule set; the three unmerged The U `rig/*` branches first | candidate |

## Do not adopt (evidence says no)

- **Gridiron autonomous locomotion:** 1.0 s error 2.09 m against a constant-velocity baseline of 0.99 m.
- **LP NHL v0.2b player and goalie models:** the team-rate reference beat every candidate on 1,100 games, and the candidates had penalty-state failures.
- **LP NHL multi-agent movement:** descriptive only, and it claims no skill.

## Rights flags

- Broadcast footage (The U references, rigged-player-evidence) must never be shipped or committed.
- The tennis archive is CC BY-NC-SA, so it's non-commercial only.
- The licence of the source data behind `nhl-dataset` isn't stated.
- Big Data Cup terms need checking before anything derived ships.
- The local `nfldraftbuzz-madden` scrape is a rights risk.

## Not covered by this pass

- Branches not listed in the manifest's `refs`: LP has 285 remote branches, Gridiron 74, The U 17. Each was screened by name for sports, arcade, simulation and NHL relevance only.
- The LP fixture tests that need the data machine.
- Rendered visual review of any candidate. The integration gate still requires it before promotion.
