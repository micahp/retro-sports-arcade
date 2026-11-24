"""Regulation and overtime separately, per period length; real-time ratios. Usage: regot.py [runs glob dir]"""
import glob, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from summarize import games

KEYS = ('score', 'shots', 'pen', 'pp', 'ppGoals')
def tot(s): return {k: s['home'][k] + s['away'][k] for k in KEYS}
def new(): return dict(n=0, gmin=0.0, frames=0, **{k: 0 for k in KEYS})
def fmt(D):
    if not D['n']: return 'none'
    p = lambda k: D[k] / D['gmin'] * 60
    return (f"{D['n']} games, {D['gmin']:.1f} game-min | goals {D['score']} shots {D['shots']} pen {D['pen']} pp {D['pp']} ppg {D['ppGoals']} | "
            f"per 60 game-min: goals {p('score'):.2f}, shots {p('shots'):.1f}, pen {p('pen'):.1f}, pp {p('pp'):.1f} | "
            f"real min {D['frames'] / 59.92 / 60:.1f}, real s per game s {D['frames'] / 59.92 / (D['gmin'] * 60):.3f}")

d = sys.argv[1] if len(sys.argv) > 1 else 'E:/emu/work/runs/C3'
for cfg in ('5-pen', '10-pen', '20-pen'):
    R, O = new(), new()
    for p in glob.glob(f'{d}/{cfg}-s*.jsonl'):
        for g in games(p):
            st, fin = g[0], g[-1]
            per = [r for r in g if r['type'] == 'gsp']
            reg = next(r for r in per if r['from'] == 2)
            a, b = tot(reg), tot(fin)
            R['n'] += 1; R['gmin'] += 3 * st['perTimeTotal'] / 60; R['frames'] += reg['frame'] - st['frame']
            for k in KEYS: R[k] += a[k]
            if len(per) > 3:
                # OT clock counts DOWN from the OT length (600 s); the first sample can be a stale 0 before reset
                oc = [r['clock'] for r in g if r['type'] == 'clock' and r['gsp'] == 3]
                ot = max(oc) - min(oc[1:] or oc)
                O['n'] += 1; O['gmin'] += ot / 60; O['frames'] += fin['frame'] - reg['frame']
                for k in KEYS: O[k] += b[k] - a[k]
    print(f'{cfg} regulation: {fmt(R)}')
    print(f'{cfg} overtime:   {fmt(O)}')
g = list(games('E:/emu/work/runs/test1.jsonl'))[0]
print(f"Phase A game: {g[-1]['frames']} frames = {g[-1]['frames'] / 59.92 / 60:.1f} real min (10-min periods + 6:29 OT, penalties off)")
