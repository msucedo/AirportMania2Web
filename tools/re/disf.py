#!/usr/bin/env python3
"""Disassembly of an address range with float constants decoded.

Usage: python3 -I tools/re/disf.py <start> <end>
Shows movw/movt pairs and pc-relative literal loads as floats, and drops padding.
"""
import pickle, re, struct, sys, os

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.re')
ix = pickle.load(open(os.path.join(root, 'index.pkl'), 'rb'))
data = open(os.path.join(root, 'AM2S_armv7'), 'rb').read()
lo, hi = (int(a, 16) for a in sys.argv[1:3])
f32 = lambda v: struct.unpack('<f', struct.pack('<I', v & 0xffffffff))[0]
reg = {}
for a, t in ix['rows']:
    if not lo <= a < hi or re.match(r'(movs r0, r0|nop)$', t):
        continue
    extra = ''
    m = re.match(r'movw\s+(\w+), #0x([0-9a-f]+)', t)
    if m:
        reg[m.group(1)] = int(m.group(2), 16)
    m = re.match(r'movt\s+(\w+), #0x([0-9a-f]+)', t)
    if m:
        reg[m.group(1)] = (reg.get(m.group(1), 0) & 0xffff) | int(m.group(2), 16) << 16
        extra = f'   ; {m.group(1)} = {f32(reg[m.group(1)]):.6g}'
    m = re.match(r'mov(?:s|\.w)?\s+(\w+), #0x([0-9a-f]+)', t)
    if m:
        reg[m.group(1)] = int(m.group(2), 16)
        if reg[m.group(1)] > 0xffff:
            extra = f'   ; {m.group(1)} = {f32(reg[m.group(1)]):.6g}'
    m = re.search(r'\[pc, #(\d+)\]', t)
    if m and t.startswith('vldr'):
        at = ((a + 4) & ~3) + int(m.group(1)) - 0x1000
        if t.startswith('vldr s'):
            extra = f'   ; = {struct.unpack_from("<f", data, at)[0]:.6g}'
        else:
            extra = f'   ; = {struct.unpack_from("<d", data, at)[0]:.6g}'
    text = re.sub(r'\s+; .*f$', '', t)
    print(f'{a:x} {text}{extra}')
