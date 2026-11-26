# Experimental motion rebuild
Base e11eeec. Original milestone stays intact. This branch intentionally changes blade geometry in all modes; old numerical baselines are not comparable.
Edge controller: engine.motion='edges', used by playable UI. Shift requests facing the puck while moving; Ctrl brakes. Touch reverse input brakes before changing direction.
The rigid stick uses fixed shaft/blade length and angle, explicit grips, hand IK, one sampled frame for physics/render, and contact-gated release. Terminal falls explicitly release the stick. Unsupported aerial poses may use a grounded fallback; tests report them. Goalies use one grip, not a validated specialized goalie rig.
The new motion clips are prototypes. No human playtest, browser verification, reference-matched crossover or Liquid AI claim. See calibration/PLAYTEST.md.

## Player Lab
Serve the repo root with `python -m http.server 8000`. Open `/games/hockey/player-lab.html` to run scripted live-engine movement and shot cases, or scrub actual sampled poses. The lab uses the production sprite renderer and the physical stick. Green grip targets and red FK hand markers should overlap. The source page is not a browser-verified release. The goalie fixture now uses the shot release lock and last toucher exactly as releaseShot does.
