# Evidence for the R0 renderer test

Everything here was captured in headless Chromium using a software GPU (SwiftShader), with the scripts in `scripts/`.

## before-fixes/

These were captured before the three sim fixes.
- **Contact sheets:** `sheet_<seq>_<A|B|C>.png`, for the sequences skate, shoot and check.
- **Raw frames:** `<seq>_<view>_<n>.png`.
- **Spacing:** frames are 2 sim steps (1/30 s) apart, stepped exactly with `window.__lab.advance()`, using the ×3 close-up camera.
- **What they show:**
  - `sheet_shoot_*`: the puck rides the raised blade during the wind-up.
  - `sheet_skate_*` and `sheet_check_*`: a falling skater's stick hangs at hand height, hidden by the body.
  - `sheet_check_*`: skaters overlap at the faceoff.

## after-fixes/

These were captured after the fixes, for the shoot and check sequences in views B and C.
- **Spacing:** shoot frames are 2 steps apart; check frames are 3 steps apart.
- **What they show:**
  - `sheet_shoot_B`: through the wind-up (frames 3-8), the puck stays on the ice where the blade left it, then leaves at release.
  - `sheet_check_*`: falling skaters still read as upright with arms out. That is the reused Gridiron football fall, which is still an open issue.

## page/

Phone-width (400 px) screenshots of the page.
- `shot_full.png`: an early layout, with the old control dock covering panel B.
- `shot_full2.png`: the compact control dock.
- `shot_A.png`, `shot_C.png`: single panels.

## scripts/

- **Page capture:** `shot.py`, `frames.py` / `frames2.py` and `tile.py` / `tile2.py` capture and tile the page; they need `python -m http.server 8765` running in the experiment folder. `crowd.py` measures 8 vs 32 skaters. The page scripts load `_local.html`, which is `index.html` wrapped in a doctype.
- **Node checks:** `vox_test.mjs`, `stick_test.mjs` and `fall_test.mjs` run in Node against `lab/` and `web/` and check stick voxels and geometry for every baked frame. Their paths assume the experiment lives at `./site/`; change the import paths when running from the repo.
