// Paired-seed comparison of two evaluator runs (same seeds, one change).
//   node calibration/compare.mjs --base <file.jsonl.gz> --variant <file.jsonl.gz>
// Reports the per-seed paired difference for every headline measure, with a 95% CI, so a
// change that fixes one statistic and breaks another is visible in one table.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const load = (f) => gunzipSync(readFileSync(f)).toString().trim().split('\n').map(JSON.parse);
const A = load(args.base), B = load(args.variant);
const ma = A.find((r) => r.kind === 'meta'), mb = B.find((r) => r.kind === 'meta');
const byA = new Map(A.filter((r) => r.kind === 'game').map((r) => [r.seed, r])), pairs = B.filter((r) => r.kind === 'game' && byA.has(r.seed)).map((b) => [byA.get(b.seed), b]);
const MISS = ['miss-wide', 'miss-high', 'miss-boards', 'miss-net-outside', 'crossed-mouth-no-goal'];
const m = {
  goals: (g) => g.score[0] + g.score[1],
  attempts: (g) => g.shots.length,
  onTarget: (g) => g.shots.filter((s) => s.outcome === 'goal' || (s.outcome === 'save' && s.onTarget)).length,
  missed: (g) => g.shots.filter((s) => MISS.includes(s.outcome)).length,
  blocked: (g) => g.shots.filter((s) => s.outcome.startsWith('blocked')).length,
  savesOffTarget: (g) => g.shots.filter((s) => s.outcome === 'save' && !s.onTarget).length,
  passes: (g) => g.passes.length,
  completions: (g) => g.passes.filter((p) => p.outcome && p.outcome.startsWith('complete')).length,
  checkAttempts: (g) => g.checks.attempts, hits: (g) => g.checks.hits, faceoffs: (g) => g.faceoffs.length,
  pastRegulation: (g) => (g.result === 'REG' ? 0 : 1),
};
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length, sd = (a) => { const u = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - u) ** 2, 0) / Math.max(1, a.length - 1)); };
console.log(`base ${ma.tag} @ ${ma.commit} vs variant ${mb.tag} @ ${mb.commit} override ${JSON.stringify(mb.override)}; ${pairs.length} paired seeds`);
console.log('measure'.padEnd(16), 'base'.padStart(8), 'variant'.padStart(8), 'paired diff [95% CI]'.padStart(26), 'identical seeds');
for (const [k, fn] of Object.entries(m)) {
  const d = pairs.map(([a, b]) => fn(b) - fn(a)), u = mean(d), e = 1.96 * sd(d) / Math.sqrt(d.length);
  console.log(k.padEnd(16), mean(pairs.map(([a]) => fn(a))).toFixed(2).padStart(8), mean(pairs.map(([, b]) => fn(b))).toFixed(2).padStart(8), `${u.toFixed(3)} [${(u - e).toFixed(3)}, ${(u + e).toFixed(3)}]`.padStart(26), `${d.filter((x) => x === 0).length}/${d.length}`);
}
