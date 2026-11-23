// Deterministic batch evaluator. Plays seeded regulation games in worker threads with the
// read-only observer, and writes one JSON record per game.
//   node calibration/evaluate.mjs --set train --n 1000 [--start 0] [--out calibration/data] [--workers 14] [--override '{"SHOT.wrist.spread":0.7}']
// Seeds are `${set}-${index}`. Sets: 'train' for diagnosis and tuning, 'holdout' for checking.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { execSync } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));

if (isMainThread) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
  const set = args.set || 'train', n = +(args.n || 1000), start = +(args.start || 0);
  const out = args.out || path.join(HERE, 'data'), workers = +(args.workers || Math.max(1, cpus().length - 2));
  const tag = args.tag || 'baseline';
  const override = args.override ? JSON.parse(args.override) : null;
  let commit = 'unknown', dirty = true;
  try { commit = execSync('git rev-parse --short HEAD', { cwd: HERE }).toString().trim(); dirty = execSync('git status --porcelain -- ../src ../vendor', { cwd: HERE }).toString().trim() !== ''; } catch {}
  mkdirSync(out, { recursive: true });
  const file = path.join(out, `${tag}-${set}-${start}-${start + n - 1}.jsonl.gz`);
  const gz = createGzip(); gz.pipe(createWriteStream(file));
  const meta = { kind: 'meta', set, start, n, commit, dirtySim: dirty, override, node: process.version, started: new Date().toISOString(), tag };
  gz.write(JSON.stringify(meta) + '\n');
  const queue = Array.from({ length: n }, (_, k) => start + k);
  let done = 0, errors = 0; const t0 = Date.now();
  await new Promise((resolve) => {
    let live = 0;
    const spawn = () => {
      if (!queue.length) { if (live === 0) resolve(); return; }
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { override } });
      live++;
      const next = () => { if (queue.length) w.postMessage({ seed: `${set}-${queue.shift()}` }); else w.terminate(); };
      w.on('message', (rec) => {
        rec.set = set; rec.commit = commit; rec.dirtySim = dirty; rec.tag = tag;
        gz.write(JSON.stringify(rec) + '\n'); done++; if (rec.error) errors++;
        if (done % 50 === 0) process.stdout.write(`\r${done}/${n} games, ${errors} errors, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
        next();
      });
      w.on('exit', () => { live--; if (!queue.length && live === 0) resolve(); });
      next();
    };
    for (let k = 0; k < Math.min(workers, n); k++) spawn();
  });
  gz.end();
  console.log(`\nwrote ${file}: ${done} games, ${errors} errors, ${((Date.now() - t0) / 1000).toFixed(0)} s, commit ${commit}${dirty ? ' (sim has uncommitted changes)' : ''}`);
} else {
  const cfg = await import('../src/config.js');
  if (workerData.override) {
    // dotted-path overrides of config objects, for paired-seed experiments
    for (const [k, v] of Object.entries(workerData.override)) { const parts = k.split('.'); let o = cfg; for (const p of parts.slice(0, -1)) o = o[p]; o[parts.at(-1)] = v; }
  }
  const { createGame, step } = await import('../src/sim.js');
  const { createObserver } = await import('./observer.mjs');
  parentPort.on('message', ({ seed }) => {
    const w0 = performance.now();
    let S, O, error = null;
    try {
      S = createGame('regulation', seed, { auto: true }); O = createObserver(S);
      for (let i = 0; i < 60 * 60 * 40 && S.phase !== 'final'; i++) { step(S, {}); O.tick(); }
      O.finish();
    } catch (e) { error = String(e && e.stack || e).slice(0, 600); }
    const per = {}; for (const g of (O ? O.goals : [])) { per[g.period] = per[g.period] || [0, 0]; per[g.period][g.team]++; }
    const so = S && S.log.some((e) => e.type === 'attempt'), periods = S ? S.log.filter((e) => e.type === 'periodEnd').length : 0;
    parentPort.postMessage({
      kind: 'game', seed, completed: !!S && S.phase === 'final', error, wallMs: Math.round(performance.now() - w0),
      simT: S ? +S.t.toFixed(2) : null, inPlay: O ? +O.inPlay.toFixed(2) : null, playByPeriod: O ? O.playByPeriod : null,
      score: S ? S.score : null, periodGoals: per, result: so ? 'SO' : periods > 3 || Object.keys(per).some((p) => +p > 3) ? 'OT' : 'REG',
      stats: S ? S.stats : null,                                  // the sim's own counters, for reconciliation
      logCounts: S ? S.log.reduce((c, e) => ((c[e.type] = (c[e.type] || 0) + 1), c), {}) : null,
      shots: O ? O.shots.map(({ at, ...s }) => ({ ...s, atZ: at ? +at.z.toFixed(2) : null, atY: at ? +at.y.toFixed(2) : null })) : [],
      passes: O ? O.passes.map((p) => ({ t: p.t, period: p.period, team: p.team, dist: p.dist, speed: p.speed, contacts: p.contacts, outcome: p.outcome, dur: p.dur })) : [],
      poss: O ? O.poss.map((p) => ({ team: p.team, period: p.period, dur: p.dur, end: p.end, shots: p.shots, passes: p.passes })) : [],
      goals: O ? O.goals : [], faceoffs: O ? O.faceoffs : [], stoppages: O ? O.stoppages : [], checks: O ? O.checks : null,
      penaltiesOn: S ? S.penaltiesOn : null, penalties: O ? O.penalties : [], strengthTime: O ? Object.fromEntries(Object.entries(O.strengthTime).map(([k, v]) => [k, +v.toFixed(1)])) : null,
      possTime: O ? O.possTime.map((x) => +x.toFixed(1)) : null, looseTime: O ? +O.looseTime.toFixed(1) : null, issues: O ? O.issues : [],
    });
  });
}
