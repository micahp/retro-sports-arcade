# Retro Sports Arcade

**Rink '95** is the first playable original hockey vertical slice for a mechanics-first retro sports arcade.

## Visual reference board

[Compare NHL, NBA Live and Madden's sprite-to-3D progression](reference/evolution.html). This responsive HTML page includes third-party gameplay imagery, platform labels, analysis and links to the original sources. Images load from their source sites; no copyrighted screenshots are checked into this repository.

## Play the hockey prototype

Serve the repository with `python3 -m http.server 8000` and open `http://localhost:8000`.

WASD / arrows: skate · Space: shoot or poke-check · J: pass · Tab: switch · P: pause. Touch controls are included.

This is an early 3v3 arcade prototype, **not** a complete NHL simulator or a 3D physics engine. It has simple motion, passing, shots, goalies, basic AI, faceoffs and three timed periods. It has not been playtested or browser-verified yet.

See [project design, limitations and roadmap](docs/PROJECT.md) and [cross-project reuse audit](docs/CROSS-PROJECT-INTEGRATION.md).
