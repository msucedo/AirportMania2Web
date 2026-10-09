#!/usr/bin/env python3
"""Arguments of every call in an address range, by following constants through registers.

Usage: python3 -I tools/re/args.py <start> <end> [target ...]
Tracks immediates (movs/movw/movt/mvn/mov.w, register copies, float literals moved to core
registers) and stores to the outgoing stack area, and prints r0-r3 plus the stack words at each
`bl`. With targets given, only calls to those addresses are shown. Values are printed as
integers, and as floats when they look like one. Strings loaded pc-relative show as text.
The trace is linear: after a branch join a register may show a stale value, so check odd results
against the disassembly.
"""
import os, pickle, re, struct, sys

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.re')
ix = pickle.load(open(os.path.join(root, 'index.pkl'), 'rb'))
data = open(os.path.join(root, 'AM2S_armv7'), 'rb').read()
lo, hi = (int(a, 16) for a in sys.argv[1:3])
targets = {int(a, 16) for a in sys.argv[3:]}
NOISE = ('__Znwm', '__ZdlPv', 'ZNSs', 'Unwind', '__cxa', 'terminate')


def show(v):
    if v is None:
        return '?'
    if isinstance(v, str):
        return repr(v)
    v &= 0xffffffff
    if v >= 0x80000000 and v > 0xffff0000:
        return str(v - (1 << 32))
    if v > 0xffff:
        f = struct.unpack('<f', struct.pack('<I', v))[0]
        if 1e-3 < abs(f) < 1e7:
            return f'{f:g}f'
        return hex(v)
    return str(v)


reg, fp, stack = {}, {}, {}
for a, t in ix['rows']:
    if not lo <= a < hi:
        continue
    m = re.search(r"-> '([^']*)'", t)
    if m and t.startswith('add'):
        dst = t.split()[1].rstrip(',')
        reg[dst] = m.group(1) if not m.group(1).startswith('0x') else int(m.group(1), 16)
        continue
    m = re.match(r'movw\s+(\w+), #0x([0-9a-f]+)', t)
    if m:
        reg[m.group(1)] = int(m.group(2), 16); continue
    m = re.match(r'movt\s+(\w+), #0x([0-9a-f]+)', t)
    if m:
        old = reg.get(m.group(1)); old = old if isinstance(old, int) else 0
        reg[m.group(1)] = (old & 0xffff) | int(m.group(2), 16) << 16; continue
    m = re.match(r'mov(?:s|\.w)?\s+(\w+), #0x([0-9a-f]+)', t)
    if m:
        reg[m.group(1)] = int(m.group(2), 16); continue
    m = re.match(r'mvn\s+(\w+), #0x([0-9a-f]+)', t)
    if m:
        reg[m.group(1)] = ~int(m.group(2), 16) & 0xffffffff; continue
    m = re.match(r'mov\s+(\w+), (\w+)$', t)
    if m:
        reg[m.group(1)] = reg.get(m.group(2)); continue
    m = re.match(r'vmov\.f32\s+(s\d+), #(\S+)', t)
    if m:
        fp[m.group(1)] = struct.unpack('<I', struct.pack('<f', float(m.group(2))))[0]; continue
    m = re.match(r'vldr\s+(s\d+), \[pc, #(\d+)\]', t)
    if m:
        fp[m.group(1)] = struct.unpack_from('<I', data, ((a + 4) & ~3) + int(m.group(2)) - 0x1000)[0]; continue
    m = re.match(r'vmov\s+(r\d+), (s\d+)$', t)
    if m:
        reg[m.group(1)] = fp.get(m.group(2)); continue
    m = re.match(r'vstr\s+(s\d+), \[sp(?:, #(\d+))?\]', t)
    if m:
        stack[int(m.group(2) or 0)] = fp.get(m.group(1)); continue
    m = re.match(r'str(?:\.w)?\s+(\w+), \[sp(?:, #0x([0-9a-f]+))?\]$', t)
    if m:
        stack[int(m.group(2) or '0', 16)] = reg.get(m.group(1)); continue
    m = re.match(r'(?:ldr|ldr\.w|adds?|subs?|add\.w|sub\.w|ldrd)\s+(r\d+)', t)
    if m and not t.startswith('str'):
        reg[m.group(1)] = None
    m = re.match(r'blx?\s+0x([0-9a-f]+)', t)
    if m:
        target = int(m.group(1), 16)
        if not any(n in t for n in NOISE) and (not targets or target in targets):
            regs = ' '.join(f'r{i}={show(reg.get(f"r{i}"))}' for i in range(1, 4))
            words = ' '.join(f'[{o}]={show(stack[o])}' for o in sorted(stack) if o <= 0x24)
            print(f'{a:x} -> {target:x}  {regs}  {words}')
        for r in ('r0', 'r1', 'r2', 'r3', 'r12', 'lr'):
            reg[r] = None
        if not any(n in t for n in NOISE):
            stack = {}
