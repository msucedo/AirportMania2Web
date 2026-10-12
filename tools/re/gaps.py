"""Lists the stretches of a function that the notes and the code never point into:
tools/re/gaps.py <start> <end> [min bytes, default 160]

For each stretch between two cited addresses: its size, the numbers it uses, what it calls and
the fields it writes. Reading a large function again is reading these.
"""
import glob
import re
import sys

start, end = int(sys.argv[1], 16), int(sys.argv[2], 16)
least = int(sys.argv[3]) if len(sys.argv) > 3 else 160
text = ''
for path in ['docs/re-notes.md'] + glob.glob('src/**/*.ts', recursive=True):
    if '/generated/' not in path:
        text += open(path, errors='replace').read()
cited = sorted({int(m, 16) for m in re.findall(r'0x([0-9a-f]{4,6})\b', text) if start <= int(m, 16) < end} | {start, end})
rows = []
for line in open('.re/full_asm.txt', errors='replace'):
    p = line.rstrip('\n').split('\t')
    if len(p) > 3 and len(p[0]) == 8:
        try:
            a = int(p[0], 16)
        except ValueError:
            continue
        if start <= a < end:
            rows.append((a, p[2], ' '.join(p[3:])))
for low, high in zip(cited, cited[1:]):
    if high - low < least:
        continue
    numbers, calls, stores = [], [], []
    for a, mnemonic, operands in rows:
        if not low < a < high:
            continue
        m = re.search(r'; (?:r\d+ )?= (-?[\d.]+(?:e[-+]?\d+)?)', operands)
        if m and (mnemonic.startswith('v') or mnemonic == 'movt') and 1e-4 < abs(float(m.group(1))) < 1e5:
            numbers.append(m.group(1))
        m = re.match(r's\d+, #(-?[\d.]+e[-+]?\d+)', operands)
        if mnemonic == 'vmov.f32' and m:
            numbers.append(f'{float(m.group(1)):g}')
        if mnemonic in ('bl', 'blx') and operands.startswith('0x') and '@' not in operands:
            calls.append(operands.split()[0][2:])
        m = re.match(r'\w+, \[(r\d+), #(0x[0-9a-f]+|\d+)\]$', operands)
        if mnemonic.startswith(('str', 'vstr')) and m and m.group(1) != 'sp':
            stores.append(m.group(2))
    uniq = lambda items: ' '.join(dict.fromkeys(items))
    print(f'{low:x}-{high:x} {high - low:5d} b | numbers: {uniq(numbers)[:90]} | calls: {uniq(calls)[:70]} | writes: {uniq(stores)[:60]}')
