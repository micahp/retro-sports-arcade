// Presentation: Gridiron's sprite stack for every skater and goalie, a pitched
// orthographic camera with the rink running up the screen (portrait phones), and
// a puck drawn for readability (slightly oversized, shadow, speed streak).
import * as THREE from '../vendor/three.module.js';
import { StackRenderer, bakeAll } from '../vendor/stack/stack-renderer.js';
import { RINK } from './config.js';
import { HOCKEY, HOCKEY_KEYS } from './poses.js';
import { animOf, TEAMS, stickWorld } from './sim.js';

export const KITS = [
  { jersey: '#1f4fa8', trim: '#f3f5f8', number: '#f3f5f8', pants: '#16213a', pantStripe: '#f3f5f8', helmet: '#1f4fa8', helmetStripe: '#f3f5f8', mask: '#c9d1d8', sock: '#1f4fa8', sockStripe: '#f3f5f8', glove: '#16213a', cleat: '#141414', belt: '#d8b57a' },
  { jersey: '#c8323a', trim: '#1d1d1f', number: '#fbefe0', pants: '#1d1d1f', pantStripe: '#c8323a', helmet: '#1d1d1f', helmetStripe: '#c8323a', mask: '#c9d1d8', sock: '#c8323a', sockStripe: '#1d1d1f', glove: '#c8323a', cleat: '#141414', belt: '#d8b57a' },
];
// Camera pitch (degrees above the ice). 72 by default; 58 (the original) and 80 kept for comparison
// with NHL 95 (debug menu). Pitch only moves the camera: positions, sizes and reach are untouched.
export const PITCHES = [58, 72, 80];
export const DEFAULT_PITCH = 72;

function rinkTexture(ppm) {
  const { hx, hz, corner, goalX, blueX, mouth, crease, centreR, dotX, dotZ, nzDotX } = RINK, m = 1.5;
  const W = Math.round((hx + m) * 2 * ppm), H = Math.round((hz + m) * 2 * ppm);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const X = (x) => (x + hx + m) * ppm, Z = (z) => (z + hz + m) * ppm;
  g.fillStyle = '#18202c'; g.fillRect(0, 0, W, H);
  const rr = (x0, z0, x1, z1, r) => { g.beginPath(); g.roundRect(X(x0), Z(z0), (x1 - x0) * ppm, (z1 - z0) * ppm, r * ppm); };
  rr(-hx, -hz, hx, hz, corner); g.fillStyle = '#eef4f8'; g.fill();
  g.save(); g.clip();
  const line = (x, col, w) => { g.fillStyle = col; g.fillRect(X(x) - w * ppm / 2, Z(-hz), w * ppm, hz * 2 * ppm); };
  line(0, '#c8323a', 0.3); line(-blueX, '#2f62b5', 0.3); line(blueX, '#2f62b5', 0.3); line(-goalX, '#c8323a', 0.05); line(goalX, '#c8323a', 0.05);
  const circ = (x, z, r, col, w = 0.05) => { g.strokeStyle = col; g.lineWidth = w * ppm; g.beginPath(); g.arc(X(x), Z(z), r * ppm, 0, Math.PI * 2); g.stroke(); };
  const dot = (x, z, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(X(x), Z(z), r * ppm, 0, Math.PI * 2); g.fill(); };
  circ(0, 0, centreR, '#2f62b5'); dot(0, 0, 0.15, '#2f62b5');
  for (const s of [-1, 1]) {
    g.fillStyle = '#9cc9ec'; g.strokeStyle = '#c8323a'; g.lineWidth = 0.05 * ppm;
    g.beginPath(); g.arc(X(s * goalX), Z(0), crease * ppm, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2); g.closePath(); g.fill(); g.stroke();
    for (const z of [-dotZ, dotZ]) { circ(s * dotX, z, centreR, '#c8323a'); dot(s * dotX, z, 0.3, '#c8323a'); dot(s * nzDotX, z, 0.3, '#c8323a'); }
  }
  g.restore();
  // centre-ice mark: the game's own name, no league marks
  g.fillStyle = 'rgba(47,98,181,0.16)'; g.font = `bold ${Math.round(1.6 * ppm)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(X(0), Z(0)); g.rotate(Math.PI / 2); g.fillText("RINK '95", 0, 0); g.restore();
  return { canvas: c, m };
}

function rinkGroup() {
  const grp = new THREE.Group();
  const { canvas, m } = rinkTexture(36);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const ice = new THREE.Mesh(new THREE.PlaneGeometry((RINK.hx + m) * 2, (RINK.hz + m) * 2), new THREE.MeshBasicMaterial({ map: tex }));
  ice.rotation.x = -Math.PI / 2; grp.add(ice);
  const shape = (hx, hz, r) => { const s = new THREE.Shape(); s.moveTo(-hx + r, -hz); s.lineTo(hx - r, -hz); s.quadraticCurveTo(hx, -hz, hx, -hz + r); s.lineTo(hx, hz - r); s.quadraticCurveTo(hx, hz, hx - r, hz); s.lineTo(-hx + r, hz); s.quadraticCurveTo(-hx, hz, -hx, hz - r); s.lineTo(-hx, -hz + r); s.quadraticCurveTo(-hx, -hz, -hx + r, -hz); return s; };
  const outer = shape(RINK.hx + 0.3, RINK.hz + 0.3, RINK.corner + 0.3); outer.holes.push(shape(RINK.hx, RINK.hz, RINK.corner));
  const boards = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: RINK.boardH, bevelEnabled: false, curveSegments: 14 }), new THREE.MeshLambertMaterial({ color: 0xf4f6f8 }));
  boards.rotation.x = -Math.PI / 2; grp.add(boards);
  const kick = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.22, bevelEnabled: false, curveSegments: 14 }), new THREE.MeshLambertMaterial({ color: 0xf2d24b }));
  kick.rotation.x = -Math.PI / 2; kick.position.y = 0.002; kick.scale.set(1.0005, 1.0005, 1.01); grp.add(kick);
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    const red = new THREE.MeshLambertMaterial({ color: 0xc8323a });
    const mesh = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55 });
    for (const z of [-RINK.mouth, RINK.mouth]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, RINK.crossbar, 8), red); p.position.set(0, RINK.crossbar / 2, z); g.add(p); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, RINK.mouth * 2, 8), red); bar.rotation.x = Math.PI / 2; bar.position.set(0, RINK.crossbar, 0); g.add(bar);
    const net = new THREE.Mesh(new THREE.BoxGeometry(RINK.netDepth, RINK.crossbar, RINK.mouth * 2, 3, 3, 4), mesh); net.position.set(s * RINK.netDepth / 2, RINK.crossbar / 2, 0); g.add(net);
    g.position.x = s * RINK.goalX; grp.add(g);
  }
  grp.add(new THREE.HemisphereLight(0xe8f0ff, 0x6a7a8a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(-6, 20, 8); grp.add(sun);
  return grp;
}

export class Renderer {
  constructor(canvas, onProgress) {
    const t0 = performance.now();
    this.bake = bakeAll(0.035, HOCKEY_KEYS);
    this.bakeMs = performance.now() - t0;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.r.setPixelRatio(Math.min(2, devicePixelRatio));
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#18202c');
    this.scene.add(rinkGroup());
    this.sr = new StackRenderer(this.bake, { maxPlayers: 16, sub: 2, kits: KITS });
    this.scene.add(this.sr.mesh);
    // shadows, user ring, pass-target ring
    const sg = new THREE.CircleGeometry(0.4, 18); sg.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: 0x0a1423, transparent: true, opacity: 0.26, depthWrite: false }), 16);
    this.shadows.frustumCulled = false; this.scene.add(this.shadows);
    const ring = (col) => { const g = new THREE.RingGeometry(0.5, 0.62, 28); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false })); m.renderOrder = 2; this.scene.add(m); return m; };
    this.userRing = ring(0xf2d24b); this.targetRing = ring(0x7fd1ff);
    // puck: drawn at 2x for readability, with a ground shadow and a speed streak
    this.puck = new THREE.Mesh(new THREE.CylinderGeometry(0.0762, 0.0762, 0.0254, 16), new THREE.MeshLambertMaterial({ color: 0x0b0d10 }));
    this.puck.scale.set(2.1, 2.4, 2.1); this.scene.add(this.puck);
    const ps = new THREE.CircleGeometry(0.17, 14); ps.rotateX(-Math.PI / 2);
    this.puckShadow = new THREE.Mesh(ps, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })); this.scene.add(this.puckShadow);
    this.streakN = 8; this.streakGeo = new THREE.BufferGeometry(); this.streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.streakN * 3), 3));
    this.streak = new THREE.Line(this.streakGeo, new THREE.LineBasicMaterial({ color: 0x0b0d10, transparent: true, opacity: 0.45 })); this.streak.frustumCulled = false; this.scene.add(this.streak);
    this.hist = [];
    // debug: puck trail and event marks
    this.trailGeo = new THREE.BufferGeometry(); this.trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(200 * 3), 3));
    this.trail = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({ color: 0xff3d7f })); this.trail.frustumCulled = false; this.trail.visible = false; this.scene.add(this.trail);
    const mg = new THREE.RingGeometry(0.25, 0.34, 16); mg.rotateX(-Math.PI / 2);
    this.marks = new THREE.InstancedMesh(mg, new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false }), 40); this.marks.frustumCulled = false; this.marks.visible = false; this.scene.add(this.marks);
    // sticks: drawn per frame in world space from the physics stick (sim.stickWorld), not baked into
    // the sprite, and depth-tested against the sprite layers so they pass in front of / behind the body.
    // Shaft and blade at real length and position; cross-sections slightly thick so they read on a phone.
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.shafts = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xc9a36a }), 16); this.shafts.frustumCulled = false; this.scene.add(this.shafts);
    this.blades = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0x16181b }), 16); this.blades.frustumCulled = false; this.scene.add(this.blades);
    this.STICK = { shaft: 0.045, blade: [0.03, 0.07] };
    // contact debugging: top hand (white), heel (orange), toe (cyan), physics contact point (magenta) and
    // its spot on the ice
    const sph = new THREE.SphereGeometry(0.045, 10, 8);
    this.pts = new THREE.InstancedMesh(sph, new THREE.MeshBasicMaterial({ depthTest: false }), 64); this.pts.renderOrder = 5; this.pts.frustumCulled = false; this.pts.visible = false; this.scene.add(this.pts);
    const cg = new THREE.RingGeometry(0.09, 0.13, 20); cg.rotateX(-Math.PI / 2);
    this.contactRing = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ color: 0xff2bd6, depthWrite: false }), 16); this.contactRing.frustumCulled = false; this.contactRing.visible = false; this.scene.add(this.contactRing);
    this.contacts = false;
    this.pitchDeg = DEFAULT_PITCH;
    this.v3 = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
    this.view = { w: 19, fx: 0, fz: 0 };
    this.tmp = new THREE.Matrix4(); this.col = new THREE.Color();
    this.frameOf = (p) => {
      const { name, t } = animOf(p), a = HOCKEY[name], ix = this.bake.index[name];
      const i = a.loop ? Math.floor(((t / a.dur) % 1 + 1) % 1 * a.frames) % a.frames : Math.min(a.frames - 1, Math.round(Math.min(1, t / a.dur) * (a.frames - 1)));
      return ix.start + i;
    };
  }
  resize(w, h) { this.r.setSize(w, h, false); this.aspect = w / h; }
  setPitch(deg) { this.pitchDeg = deg; }
  /** Segment a->b as an oriented box: length along a->b, `up` kept vertical where possible. */
  segment(mesh, i, a, b, w, h) {
    const [A, B, F, U] = this.v3; A.set(a.x, a.y, a.z); B.set(b.x, b.y, b.z);
    F.subVectors(B, A); const len = F.length() || 1e-6; F.divideScalar(len);
    U.set(0, 1, 0); if (Math.abs(F.dot(U)) > 0.98) U.set(1, 0, 0);
    const R = new THREE.Vector3().crossVectors(U, F).normalize(); U.crossVectors(F, R).normalize();
    this.tmp.makeBasis(R, U, F); this.tmp.scale(new THREE.Vector3(w, h, len)); this.tmp.setPosition((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    mesh.setMatrixAt(i, this.tmp);
  }
  draw(S, dt, debug) {
    const t0 = performance.now();
    const PITCH = this.pitchDeg * Math.PI / 180;
    const pk = S.puck, skaters = S.skaters.filter((p) => !p.benched);
    // camera leads the puck a little in the direction it moves (S.focus overrides, for the Player Lab)
    const fp = S.focus || pk;
    const lx = fp.x + (fp.vx || 0) * 0.25, lz = fp.z + (fp.vz || 0) * 0.1;
    const k = S.focus ? 1 : 1 - Math.exp(-dt * 5);
    if (S.viewW) this.view.w = S.viewW;
    this.view.fx += (lx - this.view.fx) * k; this.view.fz += (lz - this.view.fz) * k;
    const hw = this.view.w / 2, hh = hw / this.aspect;           // hw across (z), hh up the screen
    const visX = hh / Math.sin(PITCH);
    const fx = Math.max(-RINK.hx - 1 + visX * 0.9, Math.min(RINK.hx + 1 - visX * 0.9, this.view.fx));
    const fz = Math.max(-RINK.hz - 1 + hw, Math.min(RINK.hz + 1 - hw, this.view.fz));
    Object.assign(this.cam, { left: -hw, right: hw, top: hh, bottom: -hh }); this.cam.updateProjectionMatrix();
    // look along +x so the rink runs up the screen and +z is to the right
    this.cam.position.set(fx - Math.cos(PITCH) * 80, Math.sin(PITCH) * 80, fz); this.cam.up.set(0, 1, 0); this.cam.lookAt(fx, 0, fz); this.cam.updateMatrixWorld();
    this.sr.update(skaters.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, frame: this.frameOf(p), team: p.team, skin: p.skin, number: p.number })));
    skaters.forEach((p, i) => { this.tmp.makeTranslation(p.x, 0.01, p.z); this.shadows.setMatrixAt(i, this.tmp); });
    this.shadows.count = skaters.length; this.shadows.instanceMatrix.needsUpdate = true;
    // sticks, from the physics stick of each player at its current animation time
    const st = skaters.map((p) => stickWorld(p)), SK = this.STICK;
    st.forEach((s, i) => { this.segment(this.shafts, i, s.T, s.H, SK.shaft, SK.shaft); this.segment(this.blades, i, s.H, s.E, SK.blade[0], SK.blade[1]); });
    this.shafts.count = this.blades.count = st.length;
    this.shafts.instanceMatrix.needsUpdate = this.blades.instanceMatrix.needsUpdate = true;
    this.pts.visible = this.contactRing.visible = this.contacts;
    if (this.contacts) {
      const cols = [0xffffff, 0xff9a2b, 0x2be3ff, 0xff2bd6]; let n = 0;
      st.forEach((s, i) => {
        [s.T, s.H, s.E, s.C].forEach((q, j) => { this.tmp.makeTranslation(q.x, q.y, q.z); this.pts.setMatrixAt(n, this.tmp); this.pts.setColorAt(n, this.col.set(cols[j])); n++; });
        this.tmp.makeTranslation(s.C.x, 0.018, s.C.z); this.contactRing.setMatrixAt(i, this.tmp);
      });
      this.pts.count = n; this.pts.instanceMatrix.needsUpdate = true; if (this.pts.instanceColor) this.pts.instanceColor.needsUpdate = true;
      this.contactRing.count = st.length; this.contactRing.instanceMatrix.needsUpdate = true;
    }
    this.puck.visible = this.puckShadow.visible = !S.hidePuck;
    const u = S.user && !S.auto ? S.user : null;
    this.userRing.visible = !!u; if (u) this.userRing.position.set(u.x, 0.015, u.z);
    const tgt = pk.pass && pk.pass.to; this.targetRing.visible = !!tgt; if (tgt) this.targetRing.position.set(tgt.x, 0.016, tgt.z);
    this.puck.position.set(pk.x, 0.03 + pk.y, pk.z); this.puckShadow.position.set(pk.x, 0.012, pk.z);
    this.puckShadow.scale.setScalar(1 + pk.y * 0.6); this.puckShadow.material.opacity = 0.3 / (1 + pk.y);
    // speed streak from the puck's real recent positions
    this.hist.push([pk.x, 0.03 + pk.y, pk.z]); if (this.hist.length > this.streakN) this.hist.shift();
    const fast = Math.hypot(pk.vx, pk.vz) > 12 && !pk.owner, sa = this.streakGeo.attributes.position.array;
    for (let i = 0; i < this.streakN; i++) { const h = this.hist[Math.max(0, this.hist.length - 1 - i)] || [pk.x, 0, pk.z]; sa.set(fast ? h : [pk.x, 0.03, pk.z], i * 3); }
    this.streakGeo.attributes.position.needsUpdate = true;
    // debug overlays
    this.trail.visible = this.marks.visible = !!debug;
    if (debug) {
      const tr = S.debug.trails, a = this.trailGeo.attributes.position.array, n = Math.min(200, tr.length);
      for (let i = 0; i < n; i++) a.set([tr[tr.length - n + i][0], 0.02, tr[tr.length - n + i][1]], i * 3);
      this.trailGeo.setDrawRange(0, n); this.trailGeo.attributes.position.needsUpdate = true;
      const cols = { shot: 0xff3d7f, hit: 0xf2d24b, save: 0x7fd1ff, post: 0xffffff };
      S.debug.marks.slice(-40).forEach((m, i) => { this.tmp.makeTranslation(m.x, 0.02, m.z); this.marks.setMatrixAt(i, this.tmp); this.marks.setColorAt(i, this.col.set(cols[m.kind] || 0xffffff)); });
      this.marks.count = Math.min(40, S.debug.marks.length); this.marks.instanceMatrix.needsUpdate = true; if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true;
    }
    this.r.render(this.scene, this.cam);
    this.ms = performance.now() - t0;
  }
}
