// Renderer B: Gridiron's sprite stack, live. Each skater is a pile of flat voxel
// layers turned to any facing in the shader; all skaters are one draw call.
// Uses web/stack/stack-renderer.js unchanged.
import * as THREE from '../web/vendor/three.module.js';
import { StackRenderer } from '../web/stack/stack-renderer.js';
import { rinkGroup, makeCamera } from './rink.js';
import { KITS } from './kits.js';

export class StackView {
  constructor(canvas, bake, aspect) {
    const t0 = performance.now();
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.r.setPixelRatio(Math.min(2, devicePixelRatio));
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#1c2533');
    this.scene.add(rinkGroup(40));
    this.sr = new StackRenderer(bake, { maxPlayers: 48, sub: 2, kits: KITS });
    this.scene.add(this.sr.mesh);
    this.shadows = blobShadows(this.scene, 48);
    this.puck = puckMesh(this.scene);
    this.cam = makeCamera(aspect);
    this.stats = { bakeMs: performance.now() - t0, memMB: (bake.AW * bake.AH * 2) / 1048576, draws: 0 };
  }
  resize(w, h) { this.r.setSize(w, h, false); }
  draw(S, frameOf) {
    const t0 = performance.now();
    const list = S.skaters.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, frame: frameOf(p), team: p.team, skin: p.skin, number: p.number }));
    this.sr.update(list);
    placeShadows(this.shadows, S.skaters);
    this.puck.position.set(S.puck.x, 0.013 + S.puck.y, S.puck.z);
    this.r.render(this.scene, this.cam);
    this.stats.draws = this.r.info.render.calls;
    this.stats.ms = performance.now() - t0;
  }
}

export function blobShadows(scene, n) {
  const g = new THREE.CircleGeometry(0.42, 20); g.rotateX(-Math.PI / 2);
  const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x0a1423, transparent: true, opacity: 0.28, depthWrite: false }), n);
  m.renderOrder = 1; m.frustumCulled = false; scene.add(m); return m;
}
const tmp = new THREE.Matrix4();
export function placeShadows(m, skaters) {
  skaters.forEach((p, i) => { tmp.makeTranslation(p.x, 0.01, p.z); m.setMatrixAt(i, tmp); });
  m.count = skaters.length; m.instanceMatrix.needsUpdate = true;
}
export function puckMesh(scene) {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.0762, 0.0762, 0.0254, 14), new THREE.MeshLambertMaterial({ color: 0x0d0f12 }));
  p.scale.setScalar(1.4); scene.add(p); return p;
}
