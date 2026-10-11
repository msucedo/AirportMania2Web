"""Prints the vtables a constructor installs: tools/re/vtable.py <constructor start> <end>"""
import re
import struct
import sys

lo, hi = (int(a, 16) for a in sys.argv[1:3])
image = open('.re/AM2S_armv7', 'rb').read()
word = lambda at: struct.unpack_from('<I', image, at - 0x1000)[0]
pending = {}
for line in open('.re/full_asm.txt'):
    parts = line.rstrip('\n').split('\t')
    if len(parts) < 4 or not lo <= int(parts[0], 16) < hi:
        continue
    address, mnemonic, operands = int(parts[0], 16), parts[2], parts[3]
    m = re.match(r'(\w+), #0x([0-9a-f]+)', operands)
    if mnemonic == 'movw' and m:
        pending[m.group(1)] = int(m.group(2), 16)
    elif mnemonic == 'movt' and m and m.group(1) in pending:
        pending[m.group(1)] |= int(m.group(2), 16) << 16
    elif mnemonic == 'add' and re.match(r'(\w+), pc$', operands) and operands.split(',')[0] in pending:
        value = (pending.pop(operands.split(',')[0]) + address + 4) & 0xffffffff
        for table in (value, word(value) if 0x176000 <= value < 0x182000 else 0):
            if 0x176000 <= table < 0x17d000:
                slots = [word(table + 8 + 4 * i) for i in range(8)]
                if all(0x2000 < s < 0x13d000 for s in slots[:3]):
                    print(f'{address:x}: vtable {table + 8:x}: ' + ' '.join(f'{s & ~1:x}' for s in slots if 0x2000 < s < 0x13d000))
