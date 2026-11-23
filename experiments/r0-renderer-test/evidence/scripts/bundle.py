"""Bundle the experiment's ES modules into one inline classic script (no imports).

Each module becomes a function that returns its exports; imports turn into
destructuring from earlier modules. Order is fixed (dependencies first).
usage: python bundle.py site/index.html out.html
"""
import re, sys, os
SITE = os.path.dirname(os.path.abspath(sys.argv[1]))
ORDER = [
    ('three', 'web/vendor/three.module.js'),
    ('skeleton', 'web/stack/skeleton.js'),
    ('body', 'web/stack/body.js'),
    ('footlock', 'web/mesh/footlock.js'),
    ('actions', 'web/stack/actions.js'),
    ('stackr', 'web/stack/stack-renderer.js'),
    ('rng', 'lab/rng.js'),
    ('adapter', 'lab/hockey-adapter.js'),
    ('sim', 'lab/sim.js'),
    ('rink', 'lab/rink.js'),
    ('kits', 'lab/kits.js'),
    ('rsprite', 'lab/r-sprite.js'),
    ('rstack', 'lab/r-stack.js'),
    ('r3d', 'lab/r-3d.js'),
    ('main', 'lab/main.js'),
]
by_path = {os.path.normpath(p): k for k, p in ORDER}

def key_for(src_rel, spec):
    return by_path[os.path.normpath(os.path.join(os.path.dirname(src_rel), spec))]

out = ['"use strict";', 'const __m = {};']
for key, rel in ORDER:
    s = open(os.path.join(SITE, rel), encoding='utf-8').read()
    exports = []
    # imports
    def imp_ns(m): return f"const {m.group(1)} = __m.{key_for(rel, m.group(2))};"
    s = re.sub(r"^import \* as (\w+) from '([^']+)';", imp_ns, s, flags=re.M)
    def imp_named(m):
        names = ', '.join(n.strip().replace(' as ', ': ') for n in m.group(1).split(',') if n.strip())
        return f"const {{ {names} }} = __m.{key_for(rel, m.group(2))};"
    s = re.sub(r"^import \{([^}]*)\} from '([^']+)';", imp_named, s, flags=re.M)
    assert not re.search(r"^import ", s, flags=re.M), (rel, 'unhandled import')
    # export lists: export { a, b as c };
    def exp_list(m):
        for n in m.group(1).split(','):
            n = n.strip()
            if not n: continue
            if ' as ' in n: a, b = [x.strip() for x in n.split(' as ')]; exports.append(f"{b}: {a}")
            else: exports.append(n)
        return ''
    s = re.sub(r"^export \{([^}]*)\};?", exp_list, s, flags=re.M)
    # export declarations
    def exp_decl(m):
        exports.append(m.group(2)); return m.group(1)
    s = re.sub(r"^(export (?:async )?function\*? (\w+))", lambda m: (exports.append(m.group(2)), m.group(1)[7:])[1], s, flags=re.M)
    s = re.sub(r"^(export class (\w+))", lambda m: (exports.append(m.group(2)), m.group(1)[7:])[1], s, flags=re.M)
    s = re.sub(r"^export (const|let|var) (\w+)", lambda m: (exports.append(m.group(2)), f"{m.group(1)} {m.group(2)}")[1], s, flags=re.M)
    assert not re.search(r"^export ", s, flags=re.M), (rel, 'unhandled export')
    # top-level await only in main (inside async boot), none at module top level
    out.append(f"__m.{key} = (() => {{\n{s}\nreturn {{ {', '.join(exports)} }};\n}})();")

html = open(sys.argv[1], encoding='utf-8').read()
js = '\n'.join(out).replace('</script', '<\\/script')
html = html.replace('<script type="module" src="lab/main.js"></script>', '<script>\n' + js + '\n</script>')
open(sys.argv[2], 'w', encoding='utf-8').write(html)
print('bundled', len(html) // 1024, 'KB')
