"""Sorts the game-logic functions of the binary the port does not cite into compiler filler and
real code, and groups the real ones by the cited function nearest before them.

Usage: tools/re/audit.py [--list] [--check addr,addr,...]
"""
import bisect
import glob
import pickle
import re
import sys

LOGIC = (0x2000, 0x8C000)

ix = pickle.load(open('.re/index.pkl', 'rb'))
functions = sorted(set(f for refs in ix['callers'].values() for _, f in refs) | set(ix['calls'].keys()))
size = {f: functions[i + 1] - f for i, f in enumerate(functions[:-1])}

# The listing, by address.
lines = {}
for line in open('.re/full_asm.txt', errors='replace'):
    parts = line.rstrip('\n').split('\t')
    if len(parts) > 3 and len(parts[0]) == 8:
        try:
            lines[int(parts[0], 16)] = (parts[2], ' '.join(parts[3:]))
        except ValueError:
            pass
addresses = sorted(lines)


def body(function):
    start = bisect.bisect_left(addresses, function)
    end = bisect.bisect_left(addresses, function + size[function])
    return [lines[a] for a in addresses[start:end]]


def cited():
    text = ''
    for path in ['docs/re-notes.md'] + glob.glob('src/**/*.ts', recursive=True) + glob.glob('tools/**/*.py', recursive=True):
        if path.endswith('audit.py'):
            continue
        text += open(path, errors='replace').read()
    found = set()
    for match in re.finditer(r'0x([0-9a-f]{4,6})\b', text):
        address = int(match.group(1), 16)
        if functions[0] <= address < functions[-1]:
            found.add(functions[bisect.bisect_right(functions, address) - 1])
    return found


strings = {}
for address, refs in ix['sxref'].items():
    for _, function in refs:
        strings.setdefault(function, []).append(ix['strings'][address])

TEMPLATES = ('_M_insert_aux', '_M_fill_insert', 'basic_string', 'vector::', 'deque::', '_M_range_insert')
UNWIND = ('__Unwind_SjLj_Register', '__Unwind_SjLj_Unregister', '__Unwind_SjLj_Resume', '__ZSt9terminatev', '___cxa_')
FREE = ('__ZdlPv', '__ZdaPv')


def classify(function):
    """Returns (category, reason)."""
    code = body(function)
    text = [f'{m} {o}' for m, o in code]
    calls = [o for m, o in code if m in ('bl', 'blx') and o.startswith('0x')]
    real_calls = [c for c in calls if not any(tag in c for tag in UNWIND + FREE + ('__ZNSsD2Ev', '__Znwm'))]
    floats = sum(1 for m, _ in code if m.startswith('v') and m not in ('vpush', 'vpop', 'vorr'))
    own = strings.get(function, [])
    if any(any(tag in s for tag in TEMPLATES) for s in own):
        return 'template', 'standard container'
    if size[function] <= 24:
        return 'filler', 'tiny'
    frees = sum(1 for c in calls if any(tag in c for tag in FREE))
    string_dtors = sum(1 for c in calls if '__ZNSsD2Ev' in c)
    if frees and floats == 0 and len(real_calls) <= 3 and not own:
        return 'filler', 'destructor'
    if floats == 0 and not own and len(real_calls) <= 1 and size[function] <= 320 and any('Unwind' in c for c in calls):
        return 'filler', 'guarded wrapper'
    if floats == 0 and not own and len(real_calls) <= 1 and size[function] <= 64:
        return 'filler', 'small wrapper or accessor'
    if floats == 0 and not own and not real_calls and (frees or string_dtors):
        return 'filler', 'cleanup'
    # A destructor that tears its members down: guarded, with landing pads, and nothing but
    # calls: no numbers, no text, nothing made.
    pads = any('Unwind_SjLj_Resume' in c or 'terminatev' in c for c in calls)
    makes = any('__Znwm' in c for c in calls)
    if floats == 0 and not own and pads and not makes and len(real_calls) <= 6 and size[function] <= 420:
        return 'filler', 'guarded teardown'
    return 'real', ''


def main():
    known = cited()
    logic = [f for f in size if LOGIC[0] <= f < LOGIC[1]]
    if '--check' in sys.argv:
        for token in sys.argv[sys.argv.index('--check') + 1].split(','):
            function = functions[bisect.bisect_right(functions, int(token, 16)) - 1]
            print(f'{function:x} {size[function]:5d} {classify(function)} cited={function in known}')
        return
    totals = {}
    real = []
    for function in logic:
        if function in known:
            category = 'cited'
        else:
            category, _ = classify(function)
            if category == 'real':
                real.append(function)
        count, total = totals.get(category, (0, 0))
        totals[category] = (count + 1, total + size[function])
    everything = sum(size[f] for f in logic)
    print(f'logic: {len(logic)} functions, {everything} bytes')
    for category in ('cited', 'filler', 'template', 'real'):
        count, total = totals.get(category, (0, 0))
        print(f'  {category:9s} {count:5d} functions {total:7d} bytes {100 * total / everything:5.1f}%')
    cited_bytes = totals['cited'][1]
    real_bytes = totals.get('real', (0, 0))[1]
    print(f'  read of what is not filler: {100 * cited_bytes / (cited_bytes + real_bytes):.1f}%')
    if '--list' not in sys.argv:
        return
    # Runs of uncited real functions between two cited ones, largest first.
    runs = []
    current = []
    for function in sorted(logic):
        if function in known:
            if current:
                runs.append(current)
            current = []
        elif function in real:
            current.append(function)
    if current:
        runs.append(current)
    runs.sort(key=lambda run: -sum(size[f] for f in run))
    for run in runs:
        total = sum(size[f] for f in run)
        names = []
        for function in run:
            for s in strings.get(function, []):
                if s not in names:
                    names.append(s)
        callers = sorted({c for f in run for _, c in ix['callers'].get(f, []) if c not in run})
        print(f'{run[0]:x}-{run[-1] + size[run[-1]]:x} {len(run):3d} fn {total:6d} b | strings: {"; ".join(names[:8])[:150]} | called from: {" ".join(f"{c:x}" for c in callers[:6])}')


main()
