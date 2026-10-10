"""Prints the instructions leading to each call of a function: tools/re/sites.py <target> [before]"""
import pickle, sys

target = int(sys.argv[1], 16)
before = int(sys.argv[2]) if len(sys.argv) > 2 else 16
ix = pickle.load(open('.re/index.pkl', 'rb'))
lines = open('.re/full_asm.txt', errors='replace').read().split('\n')
at = {}
for i, line in enumerate(lines):
    parts = line.split('\t')
    if len(parts) > 3 and len(parts[0]) == 8:
        try:
            at[int(parts[0], 16)] = i
        except ValueError:
            pass
for address, function in sorted(ix['callers'].get(target, [])):
    i = at.get(address)
    if i is None:
        continue
    callers = sorted({f for _, f in ix['callers'].get(function, [])})
    print(f'== {address:x} in fn {function:x}, called from {" ".join(f"{c:x}" for c in callers[:6])}')
    out = []
    for line in lines[max(0, i - before):i + 1]:
        parts = line.split('\t')
        if len(parts) > 3:
            out.append(f'{parts[0].lstrip("0")}: {parts[2]} {" ".join(parts[3:])}'.strip())
    print('  ' + '\n  '.join(out))
