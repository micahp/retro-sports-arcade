"""Cross-check the goal log (scoring-team flag and strength byte) against the score and tmap samples around each goal."""
import json, glob, sys, os, collections
sys.path.insert(0, os.path.dirname(__file__))
from decode_pen import goals
c = collections.Counter(); flag = collections.Counter(); pp = collections.Counter()
for p in sorted(glob.glob('E:/emu/work/runs/C3/*.jsonl')):
    L = [json.loads(l) for l in open(p)]
    fin = next(r for r in L if r['type'] == 'final')
    C = [r for r in L if r['type'] == 'clock']
    G = list(goals(fin))
    for i, g in enumerate(G):
        # the sample where the total score first reaches i+1, and the one before it
        j = next((k for k, r in enumerate(C) if r['home'] + r['away'] >= i + 1), None)
        if not j: continue
        before, after = C[j - 1], C[j]
        scorer_is_away = after['away'] > before['away']
        flag['flag matches score change' if scorer_is_away == g['visitors'] else 'flag OPPOSITE to score change'] += 1
        mine, theirs = (before['awAp'], before['hmAp']) if scorer_is_away else (before['hmAp'], before['awAp'])
        c[(g['strength'], f'{mine}v{theirs}')] += 1
    for side, key in (('away', True), ('home', False)):
        logged = sum(1 for g in G if g['visitors'] == key and g['strength'] > 0)
        pp['team ppGoals == logged PP goals' if logged == fin[side]['ppGoals'] else 'mismatch'] += 1
print(dict(flag)); print(dict(pp))
for k, v in sorted(c.items()): print(f'log strength {k[0]:+d}  ice before the goal (scorer v other, incl. goalies) {k[1]}: {v}')
