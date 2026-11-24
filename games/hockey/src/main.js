import { createGame, step, DT, TEAMS, switchUser, stickWorld } from './sim.js';
import { MODES, RINK } from './config.js';
import { Renderer, DEFAULT_PITCH } from './render.js';
import { HOCKEY } from './poses.js';
import { SCENARIOS, RECORD } from './scenarios.js';

const $ = (id) => document.getElementById(id);
const showErr = (msg) => { const el = $('err'); el.hidden = false; el.textContent = 'Error: ' + msg; };
addEventListener('error', (e) => showErr(e.message + (e.lineno ? ` (line ${e.lineno})` : '')));
addEventListener('unhandledrejection', (e) => showErr(String((e.reason && e.reason.message) || e.reason)));

let R, S = null, paused = true, debug = false, replay = null, last = performance.now(), acc = 0;
const input = { active: false, x: 0, z: 0, pass: false, shootDown: false, shootUp: false, held: 0, holding: false, lastTouch: -1e9 };

async function boot() {
  if (!document.createElement('canvas').getContext('webgl2')) return showErr('this browser has no WebGL 2.');
  $('load').textContent = 'Building the skaters…';
  await new Promise((r) => setTimeout(r, 30));
  R = new Renderer($('ice'));
  const fit = () => { const r = $('ice').getBoundingClientRect(); R.resize(Math.max(1, r.width), Math.max(1, r.height)); };
  addEventListener('resize', fit); fit();
  $('load').hidden = true;
  S = createGame('regulation', 'attract', { auto: true });   // attract mode behind the menu
  wire();
  requestAnimationFrame(frame);
}

function start(mode) {
  replay = null;
  const opts = { auto: false, penalties: $('penT').checked };
  if (MODES[mode].periodOptions) opts.periodSec = Number($('perSel').value);
  S = createGame(mode, 'game-' + Date.now(), opts);
  paused = false; $('menu').hidden = true; $('lab').hidden = true; $('paused').hidden = true; $('hud').hidden = false; controls(true);
}

// ---------------------------------------------------------------- Player Lab
// One skater at centre ice, drawn by the game renderer with the same stick geometry the physics uses.
// Pick an action, facing, time and camera; contact points show where the physics touches the puck.
const PL = { on: false, t: 0, yaw: 0 };
const ROLE = { gStance: 'G', gButterfly: 'G', gGlove: 'G', gBlocker: 'G' };
export function labScene({ action, u, yawDeg, team = 0, puck = true, zoom = 4.5 }) {
  const name = action === 'carry' ? 'hSkate' : action, a = HOCKEY[name];
  const loop = !!a.loop, isG = ROLE[name] === 'G';
  const p = { id: 0, team, role: isG ? 'G' : 'C', isG, x: 0, z: 0, vx: 0, vz: 0, yaw: yawDeg * Math.PI / 180, skin: 0.35, number: isG ? 31 : 9, benched: false,
    act: loop ? name : 'hGlide', ph: loop ? u : 0, one: loop ? null : { name, t: u * a.dur } };
  const st = stickWorld(p);
  const withPuck = puck && ['carry', 'hPass', 'hShoot', 'hSlap'].includes(action);
  return { skaters: [p], puck: { x: withPuck ? st.C.x : 50, y: 0, z: withPuck ? st.C.z : 0, vx: 0, vz: 0, owner: null }, hidePuck: !withPuck,
    debug: { trails: [], marks: [] }, user: null, auto: true, focus: { x: 0, z: 0 }, viewW: zoom, stick: st, name, loop, dur: a.dur };
}
function labFrame(dt) {
  const action = $('plAct').value, name = action === 'carry' ? 'hSkate' : action, a = HOCKEY[name];
  if ($('plPlay').checked) { PL.t = (PL.t + dt / a.dur) % 1; $('plT').value = String(Math.round(PL.t * 1000)); }
  PL.yaw = Number($('plYaw').value);
  const sc = labScene({ action, u: PL.t, yawDeg: PL.yaw, team: $('plTeam').checked ? 1 : 0, puck: $('plPuck').checked, zoom: Number($('plZoom').value) / 10 });
  R.draw(sc, dt, false);
  const c = sc.stick.C, f = a.loop ? Math.floor(PL.t * a.frames) % a.frames : Math.round(PL.t * (a.frames - 1));
  $('plabNow').textContent = `${name} t=${(PL.t * a.dur).toFixed(2)}s (sprite frame ${f + 1}/${a.frames}) · facing ${PL.yaw}° · blade contact ${c.y.toFixed(2)} m above the ice`;
}
function openPlab() {
  controls(false); $('menu').hidden = true; $('lab').hidden = true; $('hud').hidden = true; $('plab').hidden = false; PL.on = true;
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (PL.on && R) { labFrame(dt); requestAnimationFrame(frame); return; }
  if (replay) {
    replay.i = Math.min(replay.frames.length - 1, replay.i + Math.max(1, Math.round(dt / DT)));
    const f = replay.frames[replay.i];
    const fake = { puck: { ...f.puck, owner: f.puck.owner ? {} : null }, skaters: f.skaters, debug: { trails: replay.frames.slice(0, replay.i + 1).slice(-200).map((g) => [g.puck.x, g.puck.z]), marks: [] }, user: null, auto: true };
    R.draw(fake, dt, true);
    if (replay.i >= replay.frames.length - 1) { replay.hold = (replay.hold || 0) + dt; if (replay.hold > 1.5) { replay.i = 0; replay.hold = 0; } }
  } else if (S) {
    input.active = now - input.lastTouch < 6000 && !S.auto;
    if (!paused) {
      acc += dt;
      while (acc >= DT) {
        if (input.holding) input.held += DT;
        step(S, input);
        input.pass = false; input.shootDown = false; input.shootUp = false;
        acc -= DT;
      }
    } else if (S.auto) { acc += dt; while (acc >= DT) { step(S, {}); acc -= DT; } }
    R.draw(S, dt, debug);
    hud();
  }
  requestAnimationFrame(frame);
}

function hud() {
  const m = Math.floor(S.clock / 60), s = Math.floor(S.clock % 60);
  $('sc0').textContent = S.score[0]; $('sc1').textContent = S.score[1];
  $('clock').textContent = S.mode.shootout || S.shootout ? 'SO' : `${m}:${String(s).padStart(2, '0')}`;
  $('per').textContent = S.shootout ? 'SHOOTOUT' : S.period > 3 ? 'OT' : `P${S.period}`;
  // manpower badge: only when it isn't even strength. Names the team on the power play and the time
  // left on the soonest-ending penalty, as m:ss (minors are 2:00 in NHL 95 rules).
  const serving = (S.box || []).filter((b) => b.serving), left = serving.length ? Math.max(0, Math.min(...serving.map((b) => b.left))) : 0;
  const mss = (s) => `${Math.floor(Math.ceil(s) / 60)}:${String(Math.ceil(s) % 60).padStart(2, '0')}`;
  const [m0, m1] = S.manpower || [5, 5];
  let man = '';
  if (!S.shootout && m0 !== m1) man = `${TEAMS[m0 > m1 ? 0 : 1].short} POWER PLAY ${serving.length ? mss(left) + ' · ' : ''}${Math.max(m0, m1)} on ${Math.min(m0, m1)}`;
  else if (!S.shootout && serving.length) man = `${m0} on ${m1} · ${mss(left)}`;
  $('man').textContent = man; $('man').hidden = !man;
  $('banner').textContent = S.banner || ''; $('banner').hidden = !S.banner;
  const has = S.puck.owner && S.puck.owner.team === S.userTeam;
  $('bA').querySelector('span').textContent = has ? 'PASS' : 'SWITCH';
  $('bB').querySelector('span').textContent = has ? 'SHOOT' : 'CHECK';
  const ch = input.holding && has ? Math.min(1, input.held / 0.6) : 0;
  $('bB').style.setProperty('--charge', String(ch));
  $('again').hidden = !(S.phase === 'final' && !S.auto);
  if (debug) $('dbg').textContent = `${R.ms.toFixed(1)} ms · shots ${S.stats[0].shots}-${S.stats[1].shots} · saves ${S.stats[0].saves}-${S.stats[1].saves} · passes ${S.stats[0].passesDone}/${S.stats[0].passes} · hits ${S.stats[0].hits}-${S.stats[1].hits}`;
}

// Pause freezes the game exactly where it is (no steps run); Resume continues the same game.
function pause() {
  if (!S || S.auto || paused || !$('menu').hidden) return;          // only a game you are playing
  paused = true; controls(false);
  $('pausedScore').textContent = `${TEAMS[0].short} ${S.score[0]} – ${S.score[1]} ${TEAMS[1].short} · ${$('per').textContent} ${$('clock').textContent}`;
  $('paused').hidden = false;
  $('pause').textContent = '▶ Play'; $('pause').setAttribute('aria-label', 'Play');
}
function resume() {
  if (!S || $('paused').hidden) return;
  $('paused').hidden = true; controls(true); last = performance.now(); acc = 0; paused = false;
  $('pause').textContent = '❚❚ Pause'; $('pause').setAttribute('aria-label', 'Pause');
}
const controls = (on) => { $('stick').hidden = !on; document.querySelector('.acts').hidden = !on; };
function wire() {
  controls(false);
  for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => start(b.dataset.mode);
  $('pause').onclick = () => ($('paused').hidden ? pause() : resume());   // one button: Pause / Play
  $('resume').onclick = resume;
  $('quit').onclick = () => { $('paused').hidden = true; $('hud').hidden = true; $('menu').hidden = false; S.auto = true; $('pause').textContent = '❚❚ Pause'; };
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });   // switching apps on a phone pauses
  $('again').onclick = () => { $('again').hidden = true; paused = true; $('menu').hidden = false; S.auto = true; };
  $('dbgT').onchange = (e) => { debug = e.target.checked; $('dbg').hidden = !debug; };
  $('openLab').onclick = openLab;
  $('openPlab').onclick = openPlab;
  $('plabBack').onclick = () => { PL.on = false; $('plab').hidden = true; $('menu').hidden = false; };
  $('plT').oninput = () => { $('plPlay').checked = false; PL.t = Number($('plT').value) / 1000; };
  const turn = (d) => { $('plYaw').value = String((Number($('plYaw').value) + d + 360) % 360); };
  $('plL').onclick = () => turn(-45); $('plR').onclick = () => turn(45);
  // camera pitch and contact points: one setting, mirrored on the menu and in the Player Lab
  const store = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const setPitch = (v) => { R.setPitch(v); for (const el of document.querySelectorAll('.pitchSel')) el.value = String(v); store('rink95.pitch', String(v)); };
  const setContacts = (on) => { R.contacts = on; for (const el of document.querySelectorAll('.ctT')) el.checked = on; };
  for (const el of document.querySelectorAll('.pitchSel')) el.onchange = () => setPitch(Number(el.value));
  for (const el of document.querySelectorAll('.ctT')) el.onchange = () => setContacts(el.checked);
  setPitch(Number(load('rink95.pitch')) || DEFAULT_PITCH);
  $('openPlab').addEventListener('click', () => setContacts(true));
  $('labBack').onclick = () => { replay = null; $('lab').hidden = true; $('menu').hidden = false; };
  // stick: screen up is +x on the ice, screen right is +z
  const pad = $('stick'), knob = $('knob'); let pid = null, cx = 0, cy = 0;
  pad.addEventListener('pointerdown', (e) => { pid = e.pointerId; pad.setPointerCapture(pid); const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; mv(e); });
  const mv = (e) => {
    if (e.pointerId !== pid) return;
    const rad = pad.getBoundingClientRect().width / 2;
    let dx = (e.clientX - cx) / rad, dy = (e.clientY - cy) / rad; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    input.x = -dy; input.z = dx; input.lastTouch = performance.now();
    knob.style.transform = `translate(${dx * rad * 0.5}px, ${dy * rad * 0.5}px)`;
  };
  pad.addEventListener('pointermove', mv);
  const up = (e) => { if (e.pointerId !== pid) return; pid = null; input.x = input.z = 0; knob.style.transform = ''; };
  pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
  const btn = (el, down, upf) => { el.addEventListener('pointerdown', (e) => { e.preventDefault(); input.lastTouch = performance.now(); down(); }); el.addEventListener('pointerup', (e) => { e.preventDefault(); upf && upf(); }); el.addEventListener('pointercancel', () => upf && upf()); };
  btn($('bA'), () => { input.pass = true; });
  btn($('bB'), () => { input.shootDown = true; input.holding = true; input.held = 0; }, () => { if (input.holding) { input.shootUp = true; input.holding = false; } });
  // keyboard: WASD or arrows, J = pass / switch, K = shoot (hold for slap) / check
  const keys = new Set();
  const kv = () => { let x = 0, z = 0; if (keys.has('w') || keys.has('arrowup')) x += 1; if (keys.has('s') || keys.has('arrowdown')) x -= 1; if (keys.has('d') || keys.has('arrowright')) z += 1; if (keys.has('a') || keys.has('arrowleft')) z -= 1; const l = Math.hypot(x, z); if (l) { input.x = x / l; input.z = z / l; input.lastTouch = performance.now(); } else if (pid === null) { input.x = input.z = 0; } };
  addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if (e.repeat) return; if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault(); keys.add(k); kv(); if (k === 'j') { input.pass = true; input.lastTouch = performance.now(); } if (k === 'k' || k === ' ') { input.shootDown = true; input.holding = true; input.held = 0; input.lastTouch = performance.now(); } if (k === 'escape' || k === 'p') { if (!$('paused').hidden) resume(); else pause(); } });
  addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); keys.delete(k); kv(); if ((k === 'k' || k === ' ') && input.holding) { input.shootUp = true; input.holding = false; } });
}

function openLab() {
  controls(false);
  $('menu').hidden = true; $('lab').hidden = false; $('hud').hidden = true;
  const list = $('labList'); list.innerHTML = '';
  SCENARIOS.forEach((sc) => {
    const row = document.createElement('div'); row.className = 'lrow';
    row.innerHTML = `<div class="lmain"><b>${sc.name}</b><span>${sc.what}</span><em class="lres">running…</em></div><button type="button" class="ghost">Replay</button>`;
    list.appendChild(row);
    setTimeout(() => {
      const r = sc.run();
      const res = row.querySelector('.lres'); res.textContent = `${r.pass ? 'PASS' : 'FAIL'} · ${r.detail}`; res.className = 'lres ' + (r.pass ? 'ok' : 'bad');
    }, 50);
    row.querySelector('button').onclick = () => {
      RECORD.on = true; RECORD.frames = [];
      try { sc.run(); } finally { RECORD.on = false; }
      replay = RECORD.frames.length ? { frames: RECORD.frames.slice(0, 900), i: 0 } : null;
      $('lab').classList.add('peek');
      setTimeout(() => $('lab').classList.remove('peek'), 100);
      $('labNow').textContent = replay ? `Replaying: ${sc.name}` : `${sc.name} has no replay (it runs many trials)`;
    };
  });
}

window.__hockey = { get S() { return S; }, get R() { return R; }, labScene };   // for automated playtests and the contact sheet
boot().catch((e) => showErr(e.message));
