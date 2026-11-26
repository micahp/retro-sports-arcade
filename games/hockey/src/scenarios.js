// Puck lab: repeatable scenarios with measured pass/fail checks. The node test
// (tests/puck.test.mjs) and the in-game Puck Lab run exactly these.
import { createGame, step, addSkater, DT } from './sim.js';
import { RINK, PUCK } from './config.js';
import { leadPass } from './puck.js';

const sp = (p) => Math.hypot(p.vx, p.vz);
const lab = (seed) => createGame('lab', seed, { auto: true });
// when RECORD.on, every step is snapshotted so the in-game lab can replay the run
export const RECORD = { on: false, frames: [] };
const snap = (S) => ({ puck: { x: S.puck.x, y: S.puck.y, z: S.puck.z, vx: S.puck.vx, vz: S.puck.vz, owner: !!S.puck.owner }, skaters: S.skaters.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, team: p.team, skin: p.skin, number: p.number, act: p.act, ph: p.ph, one: p.one && { name: p.one.name, t: p.one.t } })) });
const run = (S, sec, onStep) => { for (let i = 0; i < sec / DT; i++) { step(S, {}); if (RECORD.on) RECORD.frames.push(snap(S)); if (onStep && onStep(S, i) === false) break; } };
const loosePuck = (S, o) => Object.assign(S.puck, { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, owner: null, lock: 0, shot: null, pass: null, inNet: 0 }, o);
const has = (S, type) => S.log.some((e) => e.type === type);

export const SCENARIOS = [
  {
    id: 'slide', name: 'Free slide', what: 'A 15 m/s puck slows smoothly on open ice and never speeds up between board hits.',
    run(seed = 'slide') {
      const S = lab(seed); loosePuck(S, { x: -20, z: 4, vx: 15 });
      let prev = 15, rises = 0, tStop = null, dist = 0, lx = S.puck.x, lz = S.puck.z;
      run(S, 25, (S) => { const v = sp(S.puck); if (v > prev + 1e-6 && !S.events.some((e) => e.type === 'board')) rises++; prev = v; dist += Math.hypot(S.puck.x - lx, S.puck.z - lz); lx = S.puck.x; lz = S.puck.z; if (v < 0.5 && tStop == null) tStop = S.t; });
      return { S, pass: rises === 0 && tStop > 6 && tStop < 20, detail: `stopped after ${tStop && tStop.toFixed(1)} s and ${dist.toFixed(0)} m; ${rises} speed rises off the boards` };
    },
  },
  {
    id: 'boards', name: 'Board rebound', what: 'A puck hitting the side boards at 45° bounces out at a mirrored angle and loses energy.',
    run(seed = 'boards') {
      const S = lab(seed); loosePuck(S, { x: -5, z: 6, vx: 10, vz: 10 });
      let before = null, after = null;
      run(S, 3, (S) => { if (!before && S.puck.vz > 0) before = { vx: S.puck.vx, vz: S.puck.vz }; if (S.events.some((e) => e.type === 'board')) { after = { vx: S.puck.vx, vz: S.puck.vz }; return false; } });
      const ok = after && after.vz < 0 && Math.abs(after.vz / before.vz) > 0.45 && Math.abs(after.vz / before.vz) < 0.75 && after.vx / before.vx > 0.7;
      return { S, pass: !!ok, detail: after ? `in (${before.vx.toFixed(1)}, ${before.vz.toFixed(1)}) out (${after.vx.toFixed(1)}, ${after.vz.toFixed(1)}) m/s` : 'never reached the boards' };
    },
  },
  {
    id: 'corner', name: 'Corner wrap', what: 'A puck rimmed into the corner follows the curved boards and stays in the rink.',
    run(seed = 'corner') {
      const S = lab(seed); loosePuck(S, { x: 8, z: 12.4, vx: 16, vz: 0.6 });
      let out = 0, boardsHit = 0;
      run(S, 4, (S) => { const p = S.puck; if (Math.abs(p.x) > RINK.hx || Math.abs(p.z) > RINK.hz) out++; boardsHit += S.events.filter((e) => e.type === 'board').length; });
      const turned = S.puck.vz < 0 || S.puck.x < RINK.hx - RINK.corner; return { S, pass: out === 0 && boardsHit >= 5 && turned, detail: `${boardsHit} frames on the boards, ${out} outside, came round the corner: ${turned}` };
    },
  },
  {
    id: 'goal', name: 'Goal and crossbar', what: 'Low through the mouth is a goal; over 1.22 m is not.',
    run(seed = 'goal') {
      const A = lab(seed); loosePuck(A, { x: RINK.goalX - 3, z: 0.2, vx: 20, vy: 1 });
      run(A, 1.5); const low = A.log.some((e) => e.type === 'goal');
      const B = lab(seed); loosePuck(B, { x: RINK.goalX - 6, z: 0.2, vx: 20, vy: 8 });
      run(B, 1.5); const high = B.log.some((e) => e.type === 'goal');
      return { S: A, pass: low && !high, detail: `low shot ${low ? 'scored' : 'did not score'}, high shot ${high ? 'scored (wrong)' : 'went over'}` };
    },
  },
  {
    id: 'post', name: 'Post', what: 'A shot at the post rings off it and stays out.',
    run(seed = 'post') {
      const S = lab(seed); loosePuck(S, { x: RINK.goalX - 6, z: RINK.mouth + 0.02, vx: 22, vz: 0 });
      run(S, 1.5);
      return { S, pass: has(S, 'post') && !has(S, 'goal'), detail: has(S, 'post') ? `hit the post, ${has(S, 'goal') ? 'then went in' : 'stayed out'}` : 'missed the post' };
    },
  },
  {
    id: 'behind', name: 'Net from behind', what: 'A puck sent at the back of the net bounces off it and cannot score.',
    run(seed = 'behind') {
      const S = lab(seed); loosePuck(S, { x: RINK.goalX + RINK.netDepth + 1.5, z: 0.1, vx: -12 });
      run(S, 1.5);
      return { S, pass: has(S, 'net') && !has(S, 'goal'), detail: `${has(S, 'net') ? 'bounced off the net' : 'no net contact'}, ${has(S, 'goal') ? 'scored (wrong)' : 'no goal'}` };
    },
  },
  {
    id: 'lead', name: 'Lead pass', what: 'A pass to a teammate skating across at 6 m/s arrives on his stick and he takes it without the puck jumping.',
    run(seed = 'lead') {
      const S = lab(seed);
      const a = addSkater(S, 0, 'C', { x: -8, z: 0, yaw: 0 }), b = addSkater(S, 0, 'LW', { x: 4, z: -8, vx: 0, vz: 6, yaw: Math.PI / 2 });
      a.script = () => ({ mx: 0, mz: 0, pass: S.t < 0.05 ? b : null }); b.script = () => ({ mx: 0, mz: 1 });
      Object.assign(S.puck, { owner: a, x: a.x + 0.9, z: 0 }); S.user = null;
      let jump = 0, got = null, lx = S.puck.x, lz = S.puck.z;
      run(S, 3, (S) => { const p = S.puck; jump = Math.max(jump, Math.hypot(p.x - lx, p.z - lz) - Math.max(sp(p), sp(b)) * DT); lx = p.x; lz = p.z; if (p.owner === b && got == null) got = S.t; });
      return { S, pass: got != null && jump < 0.25, detail: got != null ? `received after ${got.toFixed(2)} s; largest unexplained puck jump ${Math.max(0, jump).toFixed(2)} m` : 'pass not received' };
    },
  },
  {
    id: 'intercept', name: 'Interception', what: 'A defender standing in a pass lane picks it off most of the time.',
    run(seed = 'intercept') {
      let picks = 0, n = 12, last;
      for (let k = 0; k < n; k++) {
        const S = lab(seed + k);
        const a = addSkater(S, 0, 'C', { x: -8, z: 0 }), b = addSkater(S, 0, 'LW', { x: 8, z: 0 }), d = addSkater(S, 1, 'LD', { x: 0.3, z: 0.6, yaw: Math.PI });
        a.script = () => ({ mx: 0, mz: 0, pass: S.t < 0.05 ? b : null }); b.script = () => ({ mx: 0, mz: 0 }); d.script = () => ({ mx: 0, mz: 0 });
        Object.assign(S.puck, { owner: a, x: a.x + 0.9, z: 0 }); S.user = null;
        run(S, 2); if (S.puck.owner === d) picks++; last = S;
      }
      return { S: last, pass: picks >= n * 0.5, detail: `defender picked off ${picks} of ${n}` };
    },
  },
  {
    id: 'goalie', name: 'Goalie: middle vs corner', what: 'From 10 m, shots at the goalie are saved more often than shots at the corners.',
    run(seed = 'goalie') {
      const rate = (z, n = 30) => {
        let saves = 0;
        for (let k = 0; k < n; k++) {
          const S = createGame('lab', seed + z + k, { auto: true });
          const g = addSkater(S, 1, 'G', { x: RINK.goalX - 0.8, z: 0 });
          const sh = addSkater(S, 0, 'C', { x: RINK.goalX - 11.6, z: -0.6 }); sh.script = () => ({ mx: 0, mz: 0 });
          const dx = RINK.goalX - (RINK.goalX - 10.5), dz = z, L = Math.hypot(dx, dz);
          loosePuck(S, { x: RINK.goalX - 10.5, z: 0, vx: dx / L * 25, vz: dz / L * 25, vy: 0.5, lock: 0.12, lastTouch: sh, shot: { by: sh, team: 0, kind: 'wrist', from: { x: RINK.goalX - 10.5, z: 0 }, t: 0, resolved: {} } });
          run(S, 1.2); if (S.log.some((e) => e.type === 'save')) saves++;
        }
        return saves / n;
      };
      const mid = rate(0), corner = rate(0.8);
      return { S: null, pass: mid > corner + 0.2 && mid > 0.8, detail: `saved ${(mid * 100).toFixed(0)}% at the goalie, ${(corner * 100).toFixed(0)}% at the corner` };
    },
  },
];

export function runAll() { return SCENARIOS.map((s) => ({ id: s.id, name: s.name, what: s.what, ...s.run() })); }
