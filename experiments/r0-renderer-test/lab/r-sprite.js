// Renderer A: conventional directional sprites. Everything is pre-rendered at
// load (8 facings x every frame x 2 teams, plus the rink as one background
// image) at a fixed 16-bit-style resolution; the game then only blits images on
// a plain 2D canvas. The sprites come from the same voxel body as renderer B,
// so the comparison isolates the renderer, not the art.
import * as THREE from '../web/vendor/three.module.js';
import { StackRenderer } from '../web/stack/stack-renderer.js';
import { RINK } from './sim.js';
import { PITCH, VIEW_W, ZOOM, rinkGroup } from './rink.js';
import { KITS } from './kits.js';

const DIRS = 8;
export class SpriteView {
  constructor(canvas, bake, { width = 400, height = 225 } = {}) {
    const t0 = performance.now();
    this.canvas = canvas; canvas.width = width; canvas.height = height;
    this.ctx = canvas.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.W = width; this.H = height; this.ppm = width / VIEW_W;
    const ppm = this.ppm, sin = Math.sin(PITCH), cos = Math.cos(PITCH);
    // one throwaway WebGL context does all the pre-rendering, then is released
    const glc = document.createElement('canvas');
    const gl = new THREE.WebGLRenderer({ canvas: glc, antialias: false, alpha: true, preserveDrawingBuffer: true });
    gl.setPixelRatio(1);
    // ---- sprite sheet
    const cw = Math.ceil(2.8 * ppm), ch = Math.ceil(2.9 * ppm);
    gl.setSize(cw, ch, false);
    const scene = new THREE.Scene();
    const sr = new StackRenderer(bake, { maxPlayers: 1, sub: 2, kits: KITS });
    scene.add(sr.mesh);
    const hw = cw / ppm / 2, hh = ch / ppm / 2;
    const cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 200);
    const cy = 0.75;   // cell centre height on the body
    cam.position.set(0, cy + sin * 60, cos * 60); cam.lookAt(0, cy, 0); cam.updateMatrixWorld();
    const anchor = new THREE.Vector3(0, 0, 0).project(cam);
    this.ax = Math.round((anchor.x * 0.5 + 0.5) * cw); this.ay = Math.round((-anchor.y * 0.5 + 0.5) * ch);
    const nF = bake.frames.length, cols = 48;
    const cells = nF * DIRS * 2, rows = Math.ceil(cells / cols);
    const sheet = document.createElement('canvas'); sheet.width = cols * cw; sheet.height = rows * ch;
    const sg = sheet.getContext('2d');
    let n = 0;
    for (let team = 0; team < 2; team++) for (let d = 0; d < DIRS; d++) for (let f = 0; f < nF; f++) {
      sr.update([{ x: 0, z: 0, yaw: (d * Math.PI * 2) / DIRS, frame: f, team, skin: 0.45, number: team ? 17 : 9 }]);
      gl.render(scene, cam);
      sg.drawImage(glc, (n % cols) * cw, Math.floor(n / cols) * ch);
      n++;
    }
    sr.dispose();
    // ---- rink background, one image
    const m = 1.4, bx0 = -RINK.hx - m, bx1 = RINK.hx + m;
    const v0 = (-RINK.hz - m) * sin - 1.4 * cos, v1 = (RINK.hz + m) * sin;   // screen-v extent
    const bw = Math.ceil((bx1 - bx0) * ppm), bh = Math.ceil((v1 - v0) * ppm);
    gl.setSize(bw, bh, false);
    const bscene = new THREE.Scene(); bscene.background = new THREE.Color('#1c2533'); bscene.add(rinkGroup(ppm * 2));
    const bcam = new THREE.OrthographicCamera(bx0, bx1, -v0, -v1, -100, 300);
    // camera axes: right = +x, up = (0, cos, -sin); place it so screen-v = z sin - y cos
    bcam.position.set(0, sin * 100, cos * 100); bcam.lookAt(0, 0, 0); bcam.updateMatrixWorld();
    gl.render(bscene, bcam);
    const bg = document.createElement('canvas'); bg.width = bw; bg.height = bh; bg.getContext('2d').drawImage(glc, 0, 0);
    gl.dispose(); gl.forceContextLoss();
    Object.assign(this, { sheet, cols, cw, ch, nF, bg, bx0, v0, bake });
    this.stats = { bakeMs: performance.now() - t0, memMB: (sheet.width * sheet.height * 4 + bw * bh * 4) / 1048576, sheet: `${cells} cells of ${cw}x${ch} px`, draws: 0 };
  }

  draw(S, cam, frameOf) {
    const t0 = performance.now();
    const { ctx, W, H, ppm } = this, sin = Math.sin(PITCH), cos = Math.cos(PITCH);
    const cx = cam.x, cz = cam.z, Z = ZOOM.z;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#1c2533'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(Z, 0, 0, Z, (W / 2) * (1 - Z), (H / 2) * (1 - Z));
    const sx = (x) => (x - cx) * ppm + W / 2, sy = (z, y = 0) => ((z - cz) * sin - y * cos) * ppm + H / 2;
    ctx.drawImage(this.bg, Math.round(sx(this.bx0)), Math.round((this.v0 - cz * sin) * ppm + H / 2));
    // painter's order: farther (smaller z) first; the puck sorts in with the skaters
    const pk = S.puck;
    const items = S.skaters.map((p) => ({ z: p.z, p })).concat([{ z: pk.z - 0.05, puck: true }]).sort((a, b) => a.z - b.z);
    let draws = 1;
    for (const it of items) {
      if (it.puck) {
        ctx.fillStyle = '#0d0f12'; ctx.fillRect(Math.round(sx(pk.x)) - 2, Math.round(sy(pk.z, pk.y)) - 1, 4, 2); draws++;
        continue;
      }
      const p = it.p, px = Math.round(sx(p.x)), py = Math.round(sy(p.z));
      if (px < -60 || px > W + 60 || py < -10 || py > H + 80) continue;
      ctx.fillStyle = 'rgba(10,20,35,0.28)'; ctx.beginPath(); ctx.ellipse(px, py, 0.42 * ppm, 0.42 * ppm * sin, 0, 0, Math.PI * 2); ctx.fill();
      const f = frameOf(p);
      const d = ((Math.round(p.yaw / (Math.PI * 2 / DIRS)) % DIRS) + DIRS) % DIRS;
      const cell = (p.team * DIRS + d) * this.nF + f;
      ctx.drawImage(this.sheet, (cell % this.cols) * this.cw, Math.floor(cell / this.cols) * this.ch, this.cw, this.ch, px - this.ax, py - this.ay, this.cw, this.ch);
      draws += 2;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.stats.draws = draws;
    this.stats.ms = performance.now() - t0;
  }
}
