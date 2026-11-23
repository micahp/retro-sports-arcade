# R0 renderer test: one skater, three renderers (2026-11-23)

One 3-on-3 hockey sim, drawn three ways at once from one body and one set of poses, so only the renderer differs:
- **A. Directional sprites:** 8 facings, pre-rendered at load from B, drawn on a plain 2D canvas at 400x225.
- **B. Sprite stack:** Gridiron's `web/stack/`, live, any facing, one draw call.
- **C. Low-poly 3D:** live forward kinematics on the same skeleton, flat-shaded boxes, one draw call.

**Run it:** serve this folder (`python -m http.server`) and open `index.html`. Add `<!doctype html>` around it, or use any static host. It auto-plays; there's a touch pad and keyboard control (WASD, Space shoots, Shift stops). The toggles are slow motion, close-up and a 32-skater crowd. `window.__lab.advance(n)` steps exactly n sim frames for frame-by-frame review.

**Provenance:**
- `web/stack/{skeleton,body,actions,stack-renderer}.js`, `web/mesh/footlock.js` and `web/vendor/three.module.js` (r160, MIT) are copied **unchanged** from gridiron-physics `feat/basketball-action-library` @ `49c4000`.
- `lab/rng.js` is Gridiron's `engine/rng.js`.
- Everything in `lab/` except `rng.js` is new.
- `lab/hockey-adapter.js` adds a stick, skate blades, and the skate, glide, shoot, check and stop actions to Gridiron's exported `PARTS` and `ACTIONS`. The fall is Gridiron's football `fallFwd`, reused.
- The art and teams are original; there are no league marks.

**Results and recommendation:** see the "What the test shows" section of `index.html`. In short:
- Use B as the main arcade renderer.
- Treat A as an export of B.
- Keep C as the pose-authoring and debug view.

**Open:**
- Hockey needs its own fall; Gridiron's is a football fall.
- Gridiron's body needs a general held-prop slot; the stick uses an adapter hook.
- A's turns step every 45°.
- No passing yet.
- Phone GPU timing is unmeasured.
