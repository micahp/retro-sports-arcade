import { runAll } from '../src/scenarios.js';
let fail = 0;
for (const r of runAll()) { console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(26)} ${r.detail}`); if (!r.pass) fail++; }
console.log(fail ? `${fail} puck scenario(s) failed` : 'all puck scenarios pass');
process.exitCode = fail ? 1 : 0;
