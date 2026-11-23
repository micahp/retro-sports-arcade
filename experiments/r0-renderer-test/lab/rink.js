// Rink art and the one camera all three views share: an orthographic camera
// pitched down like a 16-bit hockey game, panning with the puck. Orthographic
// is what makes pre-rendered sprites exact; the live views use the same one.
import * as THREE from '../web/vendor/three.module.js';
import { RINK } from './sim.js';

export const PITCH = 55 * Math.PI / 180;      // camera angle below horizontal
export const VIEW_W = 17;                       // metres of rink across the view

export function rinkCanvas(ppm) {
  const { hx, hz, corner, goalX, mouth } = RINK, m = 1.2;
  const W = Math.round((hx + m) * 2 * ppm), H = Math.round((hz + m) * 2 * ppm);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const X = (x) => (x + hx + m) * ppm, Z = (z) => (z + hz + m) * ppm;
  g.fillStyle = '#1c2533'; g.fillRect(0, 0, W, H);
  const rr = (x0, z0, x1, z1, r) => { g.beginPath(); g.roundRect(X(x0), Z(z0), (x1 - x0) * ppm, (z1 - z0) * ppm, r * ppm); };
  rr(-hx - 0.25, -hz - 0.25, hx + 0.25, hz + 0.25, corner + 0.25); g.fillStyle = '#f2d24b'; g.fill();
  rr(-hx, -hz, hx, hz, corner); g.fillStyle = '#e9f1f6'; g.fill();
  g.save(); g.clip();
  const line = (x, col, w) => { g.fillStyle = col; g.fillRect(X(x) - w * ppm / 2, Z(-hz), w * ppm, hz * 2 * ppm); };
  line(0, '#c8323a', 0.3); line(-4.6, '#2f62b5', 0.3); line(4.6, '#2f62b5', 0.3);
  line(-goalX, '#c8323a', 0.06); line(goalX, '#c8323a', 0.06);
  g.strokeStyle = '#2f62b5'; g.lineWidth = 0.06 * ppm; g.beginPath(); g.arc(X(0), Z(0), 2.6 * ppm, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#2f62b5'; g.beginPath(); g.arc(X(0), Z(0), 0.15 * ppm, 0, Math.PI * 2); g.fill();
  for (const s of [-1, 1]) {
    g.fillStyle = '#8ec3ea'; g.strokeStyle = '#c8323a'; g.lineWidth = 0.05 * ppm;
    g.beginPath(); g.arc(X(s * goalX), Z(0), 1.5 * ppm, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2); g.closePath(); g.fill(); g.stroke();
    for (const fz of [-3.4, 3.4]) { g.strokeStyle = '#c8323a'; g.beginPath(); g.arc(X(s * 8.5), Z(fz), 2.1 * ppm, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#c8323a'; g.beginPath(); g.arc(X(s * 8.5), Z(fz), 0.15 * ppm, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
  return { canvas: c, X, Z, W, H, m };
}

/** Rink, boards and goals as a three.js group (live views and the sprite background bake). */
export function rinkGroup(ppm = 40) {
  const grp = new THREE.Group();
  const { canvas, m } = rinkCanvas(ppm);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const ice = new THREE.Mesh(new THREE.PlaneGeometry((RINK.hx + m) * 2, (RINK.hz + m) * 2), new THREE.MeshBasicMaterial({ map: tex }));
  ice.rotation.x = -Math.PI / 2; grp.add(ice);
  // boards: a rounded ring, 1 m tall
  const shape = (hx, hz, r) => { const s = new THREE.Shape(); s.moveTo(-hx + r, -hz); s.lineTo(hx - r, -hz); s.quadraticCurveTo(hx, -hz, hx, -hz + r); s.lineTo(hx, hz - r); s.quadraticCurveTo(hx, hz, hx - r, hz); s.lineTo(-hx + r, hz); s.quadraticCurveTo(-hx, hz, -hx, hz - r); s.lineTo(-hx, -hz + r); s.quadraticCurveTo(-hx, -hz, -hx + r, -hz); return s; };
  const outer = shape(RINK.hx + 0.25, RINK.hz + 0.25, RINK.corner + 0.25);
  outer.holes.push(shape(RINK.hx, RINK.hz, RINK.corner));
  const boards = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 1.0, bevelEnabled: false, curveSegments: 10 }), new THREE.MeshLambertMaterial({ color: 0xf4f6f8 }));
  boards.rotation.x = -Math.PI / 2; grp.add(boards);
  const kick = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.22, bevelEnabled: false, curveSegments: 10 }), new THREE.MeshLambertMaterial({ color: 0xf2d24b }));
  kick.rotation.x = -Math.PI / 2; kick.position.y = 0.001; kick.scale.set(1, 1, 1.01); grp.add(kick);
  // goals: red frame and white net
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    const red = new THREE.MeshLambertMaterial({ color: 0xc8323a }), net = new THREE.MeshLambertMaterial({ color: 0xdfe6ea, transparent: true, opacity: 0.75 });
    const post = (z) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), red); p.position.set(0, 0.6, z); g.add(p); };
    post(-RINK.mouth); post(RINK.mouth);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, RINK.mouth * 2), red); bar.position.set(0, 1.2, 0); g.add(bar);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, RINK.mouth * 2), net); back.position.set(s * 0.48, 0.55, 0); g.add(back);
    g.position.x = s * RINK.goalX; grp.add(g);
  }
  grp.add(new THREE.HemisphereLight(0xe8f0ff, 0x6a7a8a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(6, 20, 10); grp.add(sun);
  return grp;
}

/** The shared camera. aspect = width / height of the view. */
export const ZOOM = { z: 1 };
export function makeCamera(aspect) {
  const hw = VIEW_W / 2, hh = hw / aspect;
  const cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 200);
  cam.userData.aspect = aspect;
  return cam;
}
export function aimCamera(cam, fx, fz) {
  const hw = VIEW_W / 2 / ZOOM.z, hh = hw / cam.userData.aspect;
  if (cam.right !== hw) { cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh; cam.updateProjectionMatrix(); }
  const visZ = hh / Math.sin(PITCH);
  const x = Math.max(-RINK.hx - 1 + hw, Math.min(RINK.hx + 1 - hw, fx));
  const zl = Math.max(0, RINK.hz + 1.2 - visZ);
  const z = Math.max(-zl, Math.min(zl, fz));
  cam.position.set(x, Math.sin(PITCH) * 60, z + Math.cos(PITCH) * 60);
  cam.lookAt(x, 0, z);
  cam.updateMatrixWorld();
  return { x, z };
}
