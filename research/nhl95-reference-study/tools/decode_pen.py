"""Decode NHL 95 penalty (PenSum, 4 bytes) and goal (ScoreSum, 6 bytes) logs from recorder finals.
Formats read from penalty95.asm (log write in InProgress) and goal95.asm, middle95.asm GetPeriodTimeRemaining:
  time word = period << 14 | seconds elapsed in the period."""
import json, glob, sys, os, collections
NAMES = {0x12: 'roughing (2)', 0x14: 'no text', 0x16: 'charging', 0x18: 'slashing', 0x1A: 'roughing', 0x1C: 'cross-checking',
         0x1E: 'hooking', 0x20: 'tripping', 0x22: 'interference', 0x24: 'holding', 0x26: 'fighting', 0x28: 'fighting (2)',
         0x2A: 'instigator', 0x2C: 'delay of game', 0x2E: 'hooking (PS)', 0x30: 'tripping (PS)', 0x34: 'interference (PS)',
         0x36: 'roughing (PS)', 0x38: 'charging (PS)', 0x3A: 'cross-checking (PS)', 0x3C: 'slashing (PS)'}

def pens(fin):
    b = fin['penSum']
    for i in range(0, fin['penSumLength'], 4):
        t = b[i] << 8 | b[i + 1]
        yield dict(period=t >> 14, sec=t & 0x3FFF, code=b[i + 2] & 0x7F, visitors=bool(b[i + 2] & 0x80), player=b[i + 3])

def goals(fin):
    b = fin['scoreSum']
    for i in range(0, fin['scoreSumBytes'], 6):
        t = b[i] << 8 | b[i + 1]
        yield dict(period=t >> 14, sec=t & 0x3FFF, strength=(b[i + 2] & 0x7F) - 2, visitors=bool(b[i + 2] & 0x80),
                   scorer=b[i + 3], a1=b[i + 4], a2=b[i + 5])

if __name__ == '__main__':
    d = sys.argv[1] if len(sys.argv) > 1 else 'E:/emu/work/runs/C3'
    kinds, strength, byper = collections.Counter(), collections.Counter(), collections.Counter()
    n = 0
    for p in sorted(glob.glob(f'{d}/*.jsonl')):
        for line in open(p):
            r = json.loads(line)
            if r['type'] != 'final': continue
            n += 1
            for x in pens(r): kinds[NAMES.get(x['code'], hex(x['code']))] += 1; byper[x['period']] += 1
            for g in goals(r): strength[{0: 'even', 1: 'PP (+1)', 2: 'PP (+2)', -1: 'SH (-1)', -2: 'SH (-2)'}.get(g['strength'], g['strength'])] += 1
    tot = sum(kinds.values())
    print(f'{n} games, {tot} penalties')
    for k, v in kinds.most_common(): print(f'  {k:22s} {v:4d}  {v / tot:.1%}')
    print('penalties by period (0-2 regulation, 3 OT):', dict(sorted(byper.items())))
    print('goals by strength (scorer skaters minus opponent):', dict(strength))
