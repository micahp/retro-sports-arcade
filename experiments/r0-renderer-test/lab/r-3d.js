// Renderer C: simple low-poly 3D. The same skeleton and poses as A and B, but
// solved live with forward kinematics every frame and drawn as flat-shaded
// boxes (one instanced draw call). No baking, no rig import, no skinning.
import * as THREE from '../web/vendor/three.module.js';
import { poseAt } from './hockey-adapter.js';
import { rinkGroup, makeCamera } from './rink.js';
import { KITS } from './kits.js';
import { blobShadows, placeShadows, puckMesh } from './r-stack.js';

// [joint, centre offset in the joint frame, size (x fwd, y along, z side), colour role]
const PIECES = [
  ['pelvis', [0, 0.04, 0], [0.26, 0.24, 0.36], 'pants'],
  ['spine', [0, 0.1, 0], [0.24, 0.24, 0.32], 'jersey'],
  ['chest', [0, 0.15, 0], [0.3, 0.34, 0.5], 'jersey'],
  ['head', [0.02, 0.09, 0], [0.24, 0.24, 0.22], 'helmet'],
  ['shR', [0, -0.14, 0], [0.13, 0.3, 0.13], 'jersey'], ['shL', [0, -0.14, 0], [0.13, 0.3, 0.13], 'jersey'],
  ['elR', [0, -0.12, 0], [0.1, 0.26, 0.1], 'jersey'], ['elL', [0, -0.12, 0], [0.1, 0.26, 0.1], 'jersey'],
  ['wrR', [0.01, -0.05, 0], [0.11, 0.12, 0.09], 'glove'], ['wrL', [0.01, -0.05, 0], [0.11, 0.12, 0.09], 'glove'],
  ['hipR', [0, -0.22, 0], [0.18, 0.46, 0.17], 'pants'], ['hipL', [0, -0.22, 0], [0.18, 0.46, 0.17], 'pants'],
  ['knR', [0.01, -0.2, 0], [0.13, 0.42, 0.12], 'sock'], ['knL', [0.01, -0.2, 0], [0.13, 0.42, 0.12], 'sock'],
  ['anR', [0.05, -0.05, 0], [0.28, 0.09, 0.1], 'boot'], ['anL', [0.05, -0.05, 0], [0.28, 0.09, 0.1], 'boot'],
  ['anR', [0.05, -0.105, 0], [0.3, 0.03, 0.015], 'steel'], ['anL', [0.05, -0.105, 0], [0.3, 0.03, 0.015], 'steel'],
];
const PER = PIECES.length + 2;   // + stick shaft + blade

export class PolyView {
  constructor(canvas, aspect) {
    const t0 = performance.now();
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.r.setPixelRatio(Math.min(2, devicePixelRatio));
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#1c2533');
    this.scene.add(rinkGroup(40));
    this.max = 48;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), this.max * PER);
    this.mesh.frustumCulled = false; this.scene.add(this.mesh);
    this.colors = KITS.map((k) => ({ jersey: new THREE.Color(k.jersey), pants: new THREE.Color(k.pants), helmet: new THREE.Color(k.helmet), glove: new THREE.Color(k.glove), sock: new THREE.Color(k.sock), boot: new THREE.Color(k.cleat), steel: new THREE.Color('#c9d1d8'), shaft: new THREE.Color(k.belt), blade: new THREE.Color('#141414') }));
    this.shadows = blobShadows(this.scene, 48);
    this.puck = puckMesh(this.scene);
    this.cam = makeCamera(aspect);
    this.m = new THREE.Matrix4(); this.y = new THREE.Matrix4(); this.b = new THREE.Matrix4(); this.s = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3();
    this.stats = { bakeMs: performance.now() - t0, memMB: 0, draws: 0 };
  }
  resize(w, h) { this.r.setSize(w, h, false); }
  draw(S, animOf) {
    const t0 = performance.now();
    const { mesh, m, y, b, s } = this;
    let n = 0;
    for (const p of S.skaters.slice(0, this.max)) {
      const a = animOf(p);
      const { J, stick } = poseAt(a.name, a.t);
      // ground: skates on the ice, or the lowest joint when he is down
      let g = 1e9; for (const k in J) if (k[0] !== '_') g = Math.min(g, J[k].p[1] - (k.startsWith('an') ? 0.12 : 0.1));
      y.makeRotationY(-p.yaw); y.setPosition(p.x, -g, p.z);
      const col = this.colors[p.team];
      for (const [jn, c, size, role] of PIECES) {
        const R = J[jn].R, P = J[jn].p;
        b.set(R[0], R[1], R[2], P[0] + R[0] * c[0] + R[1] * c[1] + R[2] * c[2],
              R[3], R[4], R[5], P[1] + R[3] * c[0] + R[4] * c[1] + R[5] * c[2],
              R[6], R[7], R[8], P[2] + R[6] * c[0] + R[7] * c[1] + R[8] * c[2],
              0, 0, 0, 1);
        s.makeScale(size[0], size[1], size[2]);
        m.multiplyMatrices(y, b).multiply(s);
        mesh.setMatrixAt(n, m); mesh.setColorAt(n, col[role]); n++;
      }
      n = this.segment(n, stick.T, stick.H, 0.035, col.shaft);
      n = this.segment(n, stick.H, stick.E, 0.05, col.blade);
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // segments were placed in body space; move them into the world per skater
    placeShadows(this.shadows, S.skaters);
    this.puck.position.set(S.puck.x, 0.013 + S.puck.y, S.puck.z);
    this.r.render(this.scene, this.cam);
    this.stats.draws = this.r.info.render.calls;
    this.stats.ms = performance.now() - t0;
  }
  segment(n, A, B, w, color) {
    const { m, y, v, q } = this;
    const d = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]), L = d.length() || 1e-3;
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().divideScalar(L));
    v.set((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2);
    m.compose(v, q, new THREE.Vector3(w, L, w));
    m.premultiply(y);
    this.mesh.setMatrixAt(n, m); this.mesh.setColorAt(n, color);
    return n + 1;
  }
}
