"""Shot release locations from record2 output: distance to the attacked goal and heading sanity.
Home attacks +y (up) in periods 1 and 3 (manual p. 6), so away attacks -y; reversed in period 2."""
import json, sys, math, glob, collections
GOAL_Y = 267          # goal line, rink units (~3 per foot)
rows = []
for p in glob.glob(sys.argv[1] if len(sys.argv) > 1 else 'E:/emu/work/runs/V2/*.jsonl'):
    for line in open(p):
        r = json.loads(line)
        if r['type'] != 'shot' or not r['rel']: continue
        up = (r['team'] == 0) == (r['gsp'] % 2 == 0)        # this team attacks +y this period
        gy = GOAL_Y if up else -GOAL_Y
        x, y, vx, vy = r['rel']['x'], r['rel']['y'], r['rel']['vx'], r['rel']['vy']
        d_ft = math.hypot(x, y - gy) / 3
        toward = (vy > 0) == up
        rows.append((d_ft, toward, r['rel']['carrier'] >= 0))
n = len(rows)
print(f'{n} shots with a release; heading toward the attacked goal: {sum(t for _, t, _ in rows)}/{n}; carried before release: {sum(c for *_, c in rows)}/{n}')
bins = collections.Counter(min(int(d // 10) * 10, 60) for d, _, _ in rows)
for b in sorted(bins): print(f'  {b:>2}-{b + 10} ft: {bins[b]}')
print('median distance (ft):', sorted(d for d, _, _ in rows)[n // 2] if n else None)
