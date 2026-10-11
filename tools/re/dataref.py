"""Finds the code that forms a data address with movw/movt/add pc: tools/re/dataref.py <address>..."""
import re
import sys

targets = {int(a, 16) for a in sys.argv[1:]}
pending = {}
for line in open('.re/full_asm.txt'):
    parts = line.rstrip('\n').split('\t')
    if len(parts) < 4:
        continue
    address, mnemonic, operands = int(parts[0], 16), parts[2], parts[3]
    m = re.match(r'(\w+), #0x([0-9a-f]+)', operands)
    if mnemonic == 'movw' and m:
        pending[m.group(1)] = [int(m.group(2), 16), address]
    elif mnemonic == 'movt' and m and m.group(1) in pending:
        pending[m.group(1)][0] |= int(m.group(2), 16) << 16
    elif mnemonic == 'add' and re.match(r'(\w+), pc$', operands):
        register = operands.split(',')[0]
        if register in pending:
            value = (pending.pop(register)[0] + address + 4) & 0xffffffff
            if value in targets:
                print(f'{value:x} formed at {address:x}')
