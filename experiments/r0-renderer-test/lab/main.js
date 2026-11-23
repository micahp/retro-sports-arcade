import { bakeAll } from '../web/stack/stack-renderer.js';
import { HOCKEY, HOCKEY_KEYS } from './hockey-adapter.js';
import { createMatch, step, setExtras, animOf } from './sim.js';
import { aimCamera, makeCamera, ZOOM } from './rink.js';
import { SpriteView } from './r-sprite.js';
import { StackView } from './r-stack.js';
import { PolyView } from './r-3d.js';
import { KITS } from './kits.js';

const $ = (id) => document.getElementById(id);
const status = (s) => { $('loading').textContent = s; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function boot() {
  status('Voxelising the skater: 6 hockey actions…'); await nextFrame();
  const VOX = 0.03;
  const bake = bakeAll(VOX, HOCKEY_KEYS);
  const frameOf = (p) => {
    const { name, t } = animOf(p), a = HOCKEY[name], ix = bake.index[name];
    const i = a.loop ? Math.floor(((t / a.dur) % 1 + 1) % 1 * a.frames) % a.frames : Math.min(a.frames - 1, Math.round(Math.min(1, t / a.dur) * (a.frames - 1)));
    return ix.start + i;
  };
  status('Pre-rendering sprites: 8 facings × ' + bake.frames.length + ' frames × 2 teams…'); await nextFrame();
  const A = new SpriteView($('cA'), bake);
  status('Starting the live renderers…'); await nextFrame();
  const aspect = 16 / 9;
  const B = new StackView($('cB'), bake, aspect);
  const C = new PolyView($('cC'), aspect);
  const camA = makeCamera(aspect);
  const voxelMs = bake.ms;
  $('loading').hidden = true;

  const sizeLive = () => {
    for (const [v, c] of [[B, $('cB')], [C, $('cC')]]) {
      const r = c.getBoundingClientRect();
      v.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
    }
  };
  addEventListener('resize', sizeLive); sizeLive();

  const S = createMatch('rink-95');
  const input = { x: 0, z: 0, shoot: false, brake: false, active: false, last: -1e9 };
  wireInput(input);
  $('crowd').onchange = (e) => setExtras(S, e.target.checked ? 24 : 0);
  $('zoom').onchange = (e) => { ZOOM.z = e.target.checked ? 3 : 1; };
  let slow = 1;
  $('slow').onchange = (e) => { slow = e.target.checked ? 0.25 : 1; };
  let paused = false;
  $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Resume' : 'Freeze'; $('pause').setAttribute('aria-pressed', String(paused)); };

  // measured numbers: running means over the last ~2 s
  const acc = { A: [], B: [], C: [] };
  const push = (k, v) => { const a = acc[k]; a.push(v); if (a.length > 120) a.shift(); };
  const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const p95 = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length * 0.95)] || 0; };

  let last = performance.now(), accT = 0, fx = 0, fz = 0, tick = 0, flashT = 0;
  const DT = 1 / 60;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    input.active = now - input.last < 4000;
    if (!paused) {
      accT += dt * slow;
      while (accT >= DT) { step(S, DT, input); accT -= DT; input.shoot = false; for (const e of S.events) onEvent(e); }
    }
    render(dt);
    push('A', A.stats.ms); push('B', B.stats.ms); push('C', C.stats.ms);
    if (++tick % 20 === 0) {
      const n = S.skaters.length;
      for (const [key, v] of [['A', A], ['B', B], ['C', C]]) {
        $('ms' + key).textContent = mean(acc[key]).toFixed(2);
        $('p' + key).textContent = p95(acc[key]).toFixed(2);
        $('dc' + key).textContent = v.stats.draws;
        $('n' + key).textContent = n;
      }
      $('score').textContent = `${KITS[0].name} ${S.score[0]} – ${S.score[1]} ${KITS[1].name}`;
      $('who').textContent = input.active ? 'You control the blue skater nearest the puck' : 'Auto-play · touch the pad to take over';
    }
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) $('flash').textContent = ''; }
    requestAnimationFrame(frame);
  }
  function render(dt) {
    const k = 1 - Math.exp(-dt * 4);
    fx += (S.puck.x - fx) * k; fz += (S.puck.z - fz) * k;
    const camPos = aimCamera(camA, fx, fz);
    aimCamera(B.cam, fx, fz); aimCamera(C.cam, fx, fz);
    A.draw(S, camPos, frameOf); B.draw(S, frameOf); C.draw(S, animOf);
  }
  // test hook: freeze, then advance an exact number of sim steps and draw
  const advance = (n) => { paused = true; for (let i = 0; i < n; i++) step(S, DT, input); render(n * DT); };
  function onEvent(e) {
    const txt = { goal: 'GOAL', save: 'SAVE', hit: 'CHECK', shot: '' }[e];
    if (txt) { $('flash').textContent = txt; flashT = 1.1; }
  }
  // one-time numbers
  $('bakeA').textContent = Math.round(A.stats.bakeMs + voxelMs); $('memA').textContent = A.stats.memMB.toFixed(1);
  $('bakeB').textContent = Math.round(B.stats.bakeMs + voxelMs); $('memB').textContent = B.stats.memMB.toFixed(1);
  $('bakeC').textContent = Math.round(C.stats.bakeMs); $('memC').textContent = '0';
  $('frames').textContent = bake.frames.length;
  $('sheet').textContent = A.stats.sheet;
  window.__lab = { S, A, B, C, bake, acc, advance };
  requestAnimationFrame(frame);
}

function wireInput(input) {
  const keys = new Set();
  const upd = () => {
    let x = 0, z = 0;
    if (keys.has('a') || keys.has('arrowleft')) x -= 1; if (keys.has('d') || keys.has('arrowright')) x += 1;
    if (keys.has('w') || keys.has('arrowup')) z -= 1; if (keys.has('s') || keys.has('arrowdown')) z += 1;
    if (x || z) { const l = Math.hypot(x, z); input.x = x / l; input.z = z / l; input.last = performance.now(); } else if (!pad.id) { input.x = input.z = 0; }
    input.brake = keys.has('shift');
  };
  addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault(); if (k === ' ' || k === 'j') { input.shoot = true; input.last = performance.now(); } keys.add(k); upd(); });
  addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); upd(); });
  const padEl = $('pad'), knob = $('knob');
  const pad = { id: null, cx: 0, cy: 0 };
  padEl.addEventListener('pointerdown', (e) => { pad.id = e.pointerId; padEl.setPointerCapture(e.pointerId); const r = padEl.getBoundingClientRect(); pad.cx = r.left + r.width / 2; pad.cy = r.top + r.height / 2; move(e); });
  const move = (e) => {
    if (e.pointerId !== pad.id) return;
    const r = padEl.getBoundingClientRect(), rad = r.width / 2;
    let dx = (e.clientX - pad.cx) / rad, dy = (e.clientY - pad.cy) / rad; const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    input.x = dx; input.z = dy; input.last = performance.now();
    knob.style.transform = `translate(${dx * rad * 0.55}px, ${dy * rad * 0.55}px)`;
  };
  padEl.addEventListener('pointermove', move);
  const end = (e) => { if (e.pointerId !== pad.id) return; pad.id = null; input.x = input.z = 0; knob.style.transform = ''; };
  padEl.addEventListener('pointerup', end); padEl.addEventListener('pointercancel', end);
  $('shoot').addEventListener('pointerdown', (e) => { e.preventDefault(); input.shoot = true; input.last = performance.now(); });
  $('stop').addEventListener('pointerdown', (e) => { e.preventDefault(); input.brake = true; input.last = performance.now(); });
  $('stop').addEventListener('pointerup', () => { input.brake = false; });
}

boot().catch((e) => { status('Could not start: ' + e.message); console.error(e); });
