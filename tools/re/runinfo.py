"""Lists the uncited real functions of a range with what surrounds them: tools/re/runinfo.py <start> <end>"""
import runpy
import sys

sys.argv, argv = ['audit.py', '--check', '0x2160'], sys.argv
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    g = runpy.run_path('tools/re/audit.py')
ix, size, classify, body, strings = g['ix'], g['size'], g['classify'], g['body'], g['strings']
known = g['cited']()
start, end = int(argv[1], 16), int(argv[2], 16)
for function in sorted(f for f in size if start <= f < end):
    if function in known or classify(function)[0] != 'real':
        continue
    code = body(function)
    floats = sum(1 for m, _ in code if m.startswith('v') and m not in ('vpush', 'vpop', 'vorr'))
    callers = sorted({c for _, c in ix['callers'].get(function, [])})
    callees = sorted({int(o.split()[0], 16) for m, o in code if m == 'bl' and o.startswith('0x')})
    marks = lambda fs: ' '.join(f'{f:x}{"*" if f in known else ""}' for f in fs[:8])
    print(f'{function:x} {size[function]:5d} floats={floats:3d} <- {marks(callers)} | -> {marks(callees)} | {"; ".join(strings.get(function, []))[:70]}')
