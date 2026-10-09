#!/usr/bin/env python3
"""Every call in an address range with the constants set up since the previous call.

Usage: python3 -I tools/re/calls.py <start> <end> [skip-target ...]
For reading compiled scripts (stage builders, the world map): shows float and integer
immediates, pc-relative float literals and referenced strings before each `bl`.
"""
import os, pickle, re, struct, sys

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.re')
ix = pickle.load(open(os.path.join(root, 'index.pkl'), 'rb'))
data = open(os.path.join(root, 'AM2S_armv7'), 'rb').read()
lo, hi = (int(a, 16) for a in sys.argv[1:3])
skip = {int(a, 16) for a in sys.argv[3:]}
f32 = lambda v: struct.unpack('<f', struct.pack('<I', v & 0xffffffff))[0]
# Runtime helpers that carry no information: allocation, strings, exception frames.
NOISE = ('__Znwm', '__ZdlPv', 'ZNSs', 'Unwind', '__cxa', 'terminate')
reg, seen = {}, []


def note(value):
    if value > 0xffff:
        x = f32(value)
        if 1e-3 < abs(x) < 1e6:
            seen.append(f'{x:.6g}')
    elif value:
        seen.append(f'#{value}')


for a, t in ix['rows']:
    if not lo <= a < hi:
        continue
    m = re.match(r'movw\s+(\w+), #0x([0-9a-f]+)', t)
    if m:
        reg[m.group(1)] = int(m.group(2), 16)
        continue
    m = re.match(r'movt\s+(\w+), #0x([0-9a-f]+)', t)
    if m:
        reg[m.group(1)] = (reg.get(m.group(1), 0) & 0xffff) | int(m.group(2), 16) << 16
        note(reg[m.group(1)])
        continue
    m = re.match(r'mov(?:s|\.w)?\s+(\w+), #0x([0-9a-f]+)', t)
    if m:
        note(int(m.group(2), 16))
        continue
    m = re.match(r'vmov\.f32\s+\w+, #(\S+)', t)
    if m:
        seen.append(f'{float(m.group(1)):g}')
        continue
    m = re.search(r'\[pc, #(\d+)\]', t)
    if m and t.startswith('vldr s'):
        seen.append(f'{struct.unpack_from("<f", data, ((a + 4) & ~3) + int(m.group(1)) - 0x1000)[0]:.6g}')
        continue
    m = re.search(r"-> '([^']*)'", t)
    if m and not m.group(1).startswith('0x'):
        seen.append(repr(m.group(1)))
        continue
    m = re.match(r'blx?\s+0x([0-9a-f]+)', t)
    if m:
        target = int(m.group(1), 16)
        if any(n in t for n in NOISE) or target in skip:
            continue
        print(f'{a:x} -> {target:x}  {" ".join(seen)}')
        seen = []
