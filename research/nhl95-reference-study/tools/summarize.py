"""Summarize NHL 95 recorder runs: per game totals, clock speed, stoppages, options, penalty lengths."""
import json, sys, glob, os

def games(path):
    cur, out = [], []
    for line in open(path):
        r = json.loads(line)
        cur.append(r)
        if r['type'] == 'final':
            out.append(cur); cur = []
    return out

def clock_stats(recs):
    C = [r for r in recs if r['type'] == 'clock' and r['gsp'] < 3]
    run = [a['clock'] - b['clock'] for a, b in zip(C, C[1:]) if a['gsp'] == b['gsp'] and b['clock'] < a['clock']]
    stop = sum(1 for a, b in zip(C, C[1:]) if a['gsp'] == b['gsp'] and b['clock'] == a['clock'])
    return (sum(run) / len(run) if run else 0), stop / max(1, len(C) - 1)

def pp_spans(recs):
    """Game-clock seconds each team plays shorthanded (fewer skaters than the other), per span."""
    C = [r for r in recs if r['type'] == 'clock']
    spans, start = [], None
    for a in C:
        diff = a.get('hmAp', 6) != a.get('awAp', 6)
        if diff and start is None: start = a
        if not diff and start is not None:
            if a['gsp'] == start['gsp'] and a['gsp'] < 3:
                spans.append(start['clock'] - a['clock'])
            start = None
    return spans

for path in (sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else 'E:/emu/work/runs/*.jsonl')) if __name__ == '__main__' else []):
    name = os.path.basename(path)[:-6]
    for i, g in enumerate(games(path)):
        fin = g[-1]; opt = next((r for r in g if r['type'] == 'options'), {})
        per = [r for r in g if r['type'] == 'gsp']
        byper = [(p['away']['score'], p['home']['score']) for p in per]
        rate, stopped = clock_stats(g)
        h, a = fin['home'], fin['away']
        ot = len(per) > 3
        print(f"{name} g{i}: perlen={fin['perTimeTotal']}s optPen={opt.get('optPen')} optLine={opt.get('optLine')} | "
              f"VAN {a['score']}-{h['score']} NYR{' OT' if ot else ''} | shots {a['shots']}-{h['shots']} | "
              f"pen {a['pen']}-{h['pen']} pim {a['pim']}-{h['pim']} pp {a['pp']}-{h['pp']} ppg {a['ppGoals']}-{h['ppGoals']} | "
              f"frames {fin['frames']} ({fin['frames']/59.92/60:.1f} real min) | clock {rate:.2f} game-s/real-s, stopped {stopped:.0%} | "
              f"by period {byper} | shorthanded spans {pp_spans(g)}")
