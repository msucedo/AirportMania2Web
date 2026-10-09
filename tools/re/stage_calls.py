"""Lists the airport-builder calls made by a compiled stage script, with the constants set up
before each call. Usage: python3 -I tools/re/stage_calls.py <start> <end>   (hex addresses)

For every call it prints the float immediates, small integer arguments and comparisons seen since
the previous call, which is enough to read positions, flags and the improvement ids that gate it.
"""
import os, pickle, re, struct, sys, bisect

W = os.environ.get('AM2_RE_DIR') or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.re')
BUILDERS = {
    0x1328c: 'image', 0x13de4: 'scaledImage', 0x1404c: 'zImage', 0x135f4: 'sky', 0x13458: 'improvement',
    0x141ac: 'GATE', 0x1434c: 'GAS_STATION', 0x1440c: 'RUNWAY', 0x144e4: 'STOP_SPOT', 0x145a8: 'PAINT_SPOT',
    0x147f8: 'node', 0x14808: 'nodePair', 0x14678: 'builder_14678', 0x14738: 'builder_14738',
    0x14858: 'builder_14858', 0x14928: 'builder_14928', 0x149d4: 'builder_149d4', 0xcda08: 'clouds',
    0x12ddc: 'beginStage', 0x12f90: 'stageOptions', 0x1428c: 'HANGAR',
}
# Extra entry points to report, as hex addresses after the range (stage-local helper functions).
for extra in sys.argv[3:]:
    BUILDERS[int(extra.split('=')[0], 16)] = extra.split('=')[1] if '=' in extra else 'helper_' + extra

def f32(v): return struct.unpack('<f', struct.pack('<I', v & 0xffffffff))[0]

def main():
    lo, hi = int(sys.argv[1], 16), int(sys.argv[2], 16)
    ix = pickle.load(open(W + '/index.pkl', 'rb'))
    data = open(W + '/AM2S_armv7', 'rb').read()
    rows, strings = ix['rows'], ix['strings']
    i = bisect.bisect_left(rows, (lo, ''))
    pend, floats, ints, cmps, texts = {}, [], [], [], []
    while i < len(rows) and rows[i][0] < hi:
        a, t = rows[i]; i += 1
        m = re.match(r'movs\s+(r\d+), #0x([0-9a-f]+)$', t)
        if m:
            pend[m.group(1)] = int(m.group(2), 16)
            if m.group(1) in ('r1', 'r2', 'r3'): ints.append(f'{m.group(1)}={int(m.group(2), 16)}')
            continue
        m = re.match(r'movw\s+(r\d+), #0x([0-9a-f]+)', t)
        if m:
            pend[m.group(1)] = int(m.group(2), 16)
            # A bare movw into an argument register is an integer such as a price.
            if m.group(1) in ('r1', 'r2', 'r3'): ints.append(f'{m.group(1)}={int(m.group(2), 16)}')
            continue
        m = re.match(r'orr\s+(r\d+), r\d+, #0x([0-9a-f]+)$', t)
        if m and m.group(1) in ('r1', 'r2', 'r3'): ints.append(f'{m.group(1)}|={int(m.group(2), 16)}'); continue
        m = re.match(r'movt\s+(r\d+), #0x([0-9a-f]+)', t)
        if m:
            v = int(m.group(2), 16) << 16 | (pend.get(m.group(1), 0) & 0xffff); pend[m.group(1)] = v
            fv = f32(v)
            if fv == 0 or 1e-3 < abs(fv) < 1e5: floats.append(f'{fv:g}')
            continue
        m = re.match(r'mov\.w\s+(r\d+), #0x([0-9a-f]{8})$', t)
        if m:
            fv = f32(int(m.group(2), 16))
            if 1e-3 < abs(fv) < 1e5: floats.append(f'{fv:g}')
            continue
        m = re.match(r'vldr\s+\S+, \[pc, #(\d+)\]', t)
        if m: floats.append('L%g' % struct.unpack_from('<f', data, ((a + 4) & ~3) + int(m.group(1)) - 0x1000)[0]); continue
        m = re.match(r'vmov\.f32\s+\S+, #(\S+)', t)
        if m: floats.append('%g' % float(m.group(1))); continue
        m = re.match(r'add\s+(r\d+), pc$', t)
        if m and m.group(1) in pend:
            tg = (pend.pop(m.group(1)) + a + 4) & 0xffffffff
            if tg in strings: texts.append(strings[tg])
            continue
        m = re.match(r'cmp(\.w)?\s+r\d+, #0x([0-9a-f]+)', t)
        if m: cmps.append(f'{int(m.group(2), 16):#x}'); continue
        m = re.match(r'bl\s+0x([0-9a-f]+)', t)
        if m and int(m.group(1), 16) in BUILDERS:
            name = BUILDERS[int(m.group(1), 16)]
            print(f'{a:x} {name:14s} floats[{" ".join(floats)}] ints[{" ".join(ints[-6:])}] cmp[{" ".join(cmps[-6:])}] {" | ".join(texts)[:90]}')
            floats, ints, cmps, texts = [], [], [], []

main()
