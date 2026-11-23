// Read-only measurement layer. It watches the sim's state and event log after every
// step and builds lineage (shot -> outcome, pass -> outcome, possession -> end reason)
// without touching gameplay state or the random stream. tests in calibration/verify.mjs
// prove the game runs identically with and without it.
import { RINK, PUCK } from '../src/config.js';
import { DT } from '../src/sim.js';
import { attackDir } from '../src/helpers.js';

const G = 9.81;
const segDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function createObserver(S) {
  const O = {
    i: 0, cursor: 0, prev: null, period: S.period, phase: S.phase,
    shots: [], passes: [], poss: [], faceoffs: [], stoppages: [], checks: { attempts: 0, contacts: 0, hits: 0, pokes: 0, pokesWon: 0, byPeriod: {} },
    goals: [], activeShot: null, activePass: null, curPoss: null, loose: 0, inPlay: 0, playByPeriod: {},
    possTime: [0, 0], looseTime: 0, issues: [],
    penalties: [], strengthTime: {},
  };
  const touchedSinceShot = [];
  const seenCk = new WeakMap(), seenFall = new WeakMap();   // never write onto sim objects

  O.tick = () => {
    const pk = S.puck, per = S.period;
    if (S.phase === 'play') { O.inPlay += DT; O.playByPeriod[per] = (O.playByPeriod[per] || 0) + DT; const k = `${S.manpower[0]}v${S.manpower[1]}`; O.strengthTime[k] = (O.strengthTime[k] || 0) + DT; }
    // new log entries this step
    const fresh = S.log.slice(O.cursor); O.cursor = S.log.length;
    for (const e of fresh) handle(e);
    // check attempts: a check animation that started this step
    for (const p of S.skaters) {
      if (p.one && p.one.name === 'hCheck' && p.one.t <= DT * 1.5 && seenCk.get(p) !== p.one) { seenCk.set(p, p.one); O.checks.attempts++; bump(O.checks.byPeriod, per, 'attempts'); }
      if (p.one && p.one.name === 'hFall' && p.one.t <= DT * 1.5 && seenFall.get(p) !== p.one) { seenFall.set(p, p.one); O.checks.hits++; bump(O.checks.byPeriod, per, 'hits'); }
    }
    trackShot();
    trackPossession();
    if (S.phase !== O.phase) {
      if (S.phase === 'whistle' || S.phase === 'intermission') O.stoppages.push({ t: S.t, period: per, phase: S.phase, reason: (S.whistleFor && S.whistleFor.kind) || (S.phase === 'intermission' ? 'period' : 'unknown') });
      O.phase = S.phase;
    }
    O.prev = { x: pk.x, z: pk.z, y: pk.y, vx: pk.vx, vz: pk.vz, owner: pk.owner };
    O.i++;
  };

  function bump(o, per, k) { o[per] = o[per] || {}; o[per][k] = (o[per][k] || 0) + 1; }

  function handle(e) {
    const pk = S.puck, per = S.period;
    switch (e.type) {
      case 'shot': {
        if (O.activeShot && !O.activeShot.outcome) resolveShot('superseded');
        const team = e.team, d = attackDir(S, team), gx = d * RINK.goalX;
        const [x, z] = e.from, dist = Math.hypot(gx - x, z), ang = Math.atan2(Math.abs(z), Math.abs(gx - x)) * 180 / Math.PI;
        // predicted crossing of the goal-line plane from the release velocity (ballistic, no ice friction)
        let onTarget = false, at = null;
        if (pk.vx * d > 0) {
          const tau = (gx - pk.x) / pk.vx, zc = pk.z + pk.vz * tau, yc = pk.vy * tau - 0.5 * G * tau * tau;
          at = { z: zc, y: Math.max(0, yc), tau };
          onTarget = Math.abs(zc) < RINK.mouth - PUCK.radius && yc < RINK.crossbar;
        }
        const lead = S.score[team] - S.score[1 - team];
        const rebound = O.lastSaveRebound != null && S.t - O.lastSaveRebound.t < 3 && O.lastSaveRebound.forTeam === team;
        O.activeShot = { t: S.t, period: per, team, by: S.puck.lastTouch ? S.puck.lastTouch.id : null, kind: e.kind, speed: e.speed, dist: +dist.toFixed(2), angle: +ang.toFixed(1),
          onTarget, at, outcome: null, post: false, tipped: false, scoreState: Math.sign(lead), rebound, t0: S.t };
        O.shots.push(O.activeShot);
        touchedSinceShot.length = 0;
        break;
      }
      case 'save': {
        const sh = O.activeShot;
        if (sh && !sh.outcome) { sh.saveKind = e.kind; resolveShot('save'); if (!sh.onTarget) O.issues.push({ t: S.t, kind: 'save-of-off-target-shot', shot: O.shots.length - 1 }); }
        else O.issues.push({ t: S.t, kind: 'save-without-active-shot' });
        if (e.kind === 'rebound') O.lastSaveRebound = { t: S.t, forTeam: sh ? sh.team : null };
        break;
      }
      case 'goal': {
        const sh = O.activeShot;
        let src = 'non-shot';
        if (sh && !sh.outcome && sh.team === e.team) { src = sh.tipped ? 'tipped-shot' : 'shot'; resolveShot('goal'); }
        else if (sh && !sh.outcome) { src = 'own-goal-from-shot'; resolveShot('deflected-own-net'); }
        const by = e.by != null ? S.skaters[e.by] : null;
        O.goals.push({ t: S.t, period: per, team: e.team, src, byTeam: by ? by.team : null, own: by ? by.team !== e.team : null, rebound: sh ? sh.rebound : false, strength: e.strength || null });
        if (O.activePass) resolvePass('dead');
        break;
      }
      case 'deflect': {
        const b = S.skaters[e.off], sh = O.activeShot;
        if (sh && !sh.outcome && b) { if (b.isG) sh.goalieBody = true; else if (b.team !== sh.team) resolveShot('blocked'); else resolveShot('blocked-by-teammate'); }
        if (O.activePass) O.activePass.contacts++;
        break;
      }
      case 'tip': {
        const b = S.skaters[e.by], sh = O.activeShot;
        if (sh && !sh.outcome && b) { if (b.team === sh.team) sh.tipped = true; else resolveShot('blocked'); }
        if (O.activePass) O.activePass.contacts++;
        break;
      }
      case 'post': case 'crossbar': if (O.activeShot && !O.activeShot.outcome) O.activeShot.post = true; break;
      case 'board': case 'net':
        if (O.activePass) O.activePass.contacts++;
        if (O.activeShot && !O.activeShot.outcome) resolveShot(e.type === 'net' ? 'miss-net-outside' : 'miss-boards');
        break;
      case 'pass': {
        if (O.activePass) resolvePass('superseded');
        const a = S.skaters[e.from], b = S.skaters[e.to];
        O.activePass = { t: S.t, period: per, team: e.team, dist: +Math.hypot(a.x - b.x, a.z - b.z).toFixed(2), speed: e.speed, contacts: 0, outcome: null, to: e.to };
        O.passes.push(O.activePass);
        break;
      }
      case 'reception': { if (O.activePass) { O.activePass.intended = S.puck.owner && S.puck.owner.id === O.activePass.to; resolvePass(O.activePass.contacts ? 'complete-after-contact' : 'complete'); } if (O.activeShot && !O.activeShot.outcome) resolveShot('controlled-short'); break; }
      case 'interception': { if (O.activePass) resolvePass('intercepted'); if (O.activeShot && !O.activeShot.outcome) resolveShot('controlled-short'); break; }
      case 'pickup': { if (O.activeShot && !O.activeShot.outcome) resolveShot('controlled-short'); break; }
      case 'penalty': O.penalties.push({ t: S.t, period: per, team: e.team, kind: e.kind, sec: e.sec, end: null }); break;
      case 'penaltyEnd': { const pen = O.penalties.find((x) => x.team === e.team && !x.end); if (pen) { pen.end = e.why; pen.dur = +(S.t - pen.t).toFixed(2); } break; }
      case 'check': O.checks.contacts++; bump(O.checks.byPeriod, per, 'contacts'); break;
      case 'poke': O.checks.pokes++; if (e.ok) O.checks.pokesWon++; break;
      case 'faceoff': {
        const last = O.stoppages[O.stoppages.length - 1];
        const fx = S.faceSpot.x, zone = Math.abs(fx) < RINK.blueX ? 'neutral' : 'end';
        O.faceoffs.push({ t: S.t, period: per, winTeam: e.team, zone, after: last ? last.reason : 'start' });
        break;
      }
    }
  }

  function resolveShot(outcome) {
    const sh = O.activeShot; if (!sh || sh.outcome) return;
    sh.outcome = outcome; sh.dur = +(S.t - sh.t0).toFixed(3);
  }
  function resolvePass(outcome) { const p = O.activePass; if (!p) return; p.outcome = outcome; p.dur = +(S.t - p.t).toFixed(3); O.activePass = null; }

  function trackShot() {
    const sh = O.activeShot, pk = S.puck;
    if (!sh || sh.outcome || !O.prev) return;
    const d = attackDir(S, sh.team), gx = d * RINK.goalX;
    // crossed the goal-line plane without a goal or save: wide or high
    if ((O.prev.x - gx) * d < 0 && (pk.x - gx) * d >= 0) {
      if (Math.abs(pk.z) >= RINK.mouth) resolveShot('miss-wide');
      else if (pk.y >= RINK.crossbar || O.prev.y >= RINK.crossbar) resolveShot('miss-high');
      else { resolveShot('crossed-mouth-no-goal'); O.issues.push({ t: S.t, kind: 'crossed-mouth-no-goal' }); }
    } else if (S.t - sh.t0 > 3) resolveShot('unresolved');
    if (S.phase !== 'play' && !sh.outcome && S.phase !== 'whistle') resolveShot('dead');
  }

  function trackPossession() {
    const pk = S.puck, o = pk.owner, live = S.phase === 'play';
    if (!live) { if (O.curPoss && S.phase !== 'play') endPoss(S.phase === 'whistle' ? ((S.whistleFor && S.whistleFor.kind) || 'stoppage') : 'stoppage'); return; }
    if (o && !o.isG) {
      if (!O.curPoss) O.curPoss = { team: o.team, t0: S.t, period: S.period, shots: 0, passes: 0 };
      else if (O.curPoss.team !== o.team) { endPoss(turnoverReason()); O.curPoss = { team: o.team, t0: S.t, period: S.period, shots: 0, passes: 0 }; }
    }
    if (O.curPoss) O.possTime[O.curPoss.team] += DT; else O.looseTime += DT;
    // count shots and passes into the running possession
    const sh = O.activeShot; if (sh && O.curPoss && sh.t === S.t && sh.team === O.curPoss.team) O.curPoss.shots++;
    const ps = O.activePass; if (ps && O.curPoss && ps.t === S.t && ps.team === O.curPoss.team) O.curPoss.passes++;
  }
  function turnoverReason() {
    // look back over the last 2 s of log for what lost the puck
    const recent = S.log.filter((e) => S.t - e.t < 2).reverse();
    for (const e of recent) {
      if (e.type === 'interception') return 'interception';
      if (e.type === 'poke' && e.ok) return 'poke';
      if (e.type === 'save') return 'save';
      if (e.type === 'shot') return 'shot';
      if (e.type === 'check') return 'hit';
    }
    return 'loose-recovery';
  }
  function endPoss(reason) {
    const p = O.curPoss; if (!p) return;
    p.dur = +(S.t - p.t0).toFixed(3); p.end = reason; O.poss.push(p); O.curPoss = null;
  }

  O.finish = (err) => {
    if (O.activeShot && !O.activeShot.outcome) resolveShot('end');
    if (O.activePass) resolvePass('end');
    if (O.curPoss) endPoss('end');
    return O;
  };
  return O;
}
