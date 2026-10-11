"""Lists the classes of the game logic by their tables of functions: tools/re/classes.py [--members]

A table is a run of pointers to code in the data. Each is printed with the functions that form its
address (its constructors), how many of its members the port cites, and the text its uncited
members and constructors name. With --members every member is printed with its slot.
"""
import bisect
import contextlib
import io
import re
import runpy
import struct
import sys

show = '--members' in sys.argv
sys.argv = ['audit.py', '--check', '0x2160']
with contextlib.redirect_stdout(io.StringIO()):
    g = runpy.run_path('tools/re/audit.py')
ix, size, classify, strings = g['ix'], g['size'], g['classify'], g['strings']
known = g['cited']()
LOGIC = g['LOGIC']
functions = sorted(size)
owner = lambda address: functions[bisect.bisect_right(functions, address) - 1]
image = open('.re/AM2S_armv7', 'rb').read()
word = lambda address: struct.unpack_from('<I', image, address - 0x1000)[0]
is_code = lambda value: value & 1 and 0x2000 <= value - 1 < 0x13c000 and (value - 1) in size

# Every address the code forms.
formed = {}
pending = {}
for line in open('.re/full_asm.txt', errors='replace'):
    parts = line.rstrip('\n').split('\t')
    if len(parts) < 4:
        continue
    m = re.match(r'(\w+), #0x([0-9a-f]+)', parts[3])
    if parts[2] == 'movw' and m:
        pending[m.group(1)] = int(m.group(2), 16)
    elif parts[2] == 'movt' and m and m.group(1) in pending:
        pending[m.group(1)] |= int(m.group(2), 16) << 16
    elif parts[2] == 'add' and re.match(r'(\w+), pc$', parts[3]):
        register = parts[3].split(',')[0]
        if register in pending:
            formed.setdefault((pending.pop(register) + int(parts[0], 16) + 4) & 0xffffffff, []).append(int(parts[0], 16))

tables = []
address = 0x176000
end = 0x1000 + len(image) - 4
while address < min(end, 0x182000):
    if is_code(word(address)):
        start = address
        members = []
        while address < end and is_code(word(address)):
            members.append(word(address) - 1)
            address += 4
        if len(members) >= 3 and any(LOGIC[0] <= m < LOGIC[1] for m in members):
            tables.append((start, members))
    else:
        address += 4

for start, members in tables:
    # A table's address is formed 8 before its first member, or at it.
    makers = sorted({owner(a) for at in (start - 8, start) for a in formed.get(at, [])})
    own = [m for m in members if LOGIC[0] <= m < LOGIC[1]]
    read = [m for m in own if m in known]
    unread = [m for m in own if m not in known and classify(m)[0] == 'real']
    text = []
    for f in unread + makers:
        for s in strings.get(f, []):
            if s not in text:
                text.append(s)
    marks = ' '.join(f'{f:x}{"*" if f in known else ""}' for f in makers[:4])
    print(f'{start:x} members={len(members)} cited={len(read)} unread={len(unread)} ({sum(size[m] for m in unread)} b) made by: {marks} | {"; ".join(text)[:110]}')
    if show:
        for slot, m in enumerate(members):
            state = 'cited' if m in known else classify(m)[0] if LOGIC[0] <= m < LOGIC[1] else 'engine'
            print(f'    {slot:2d} {m:x} {size.get(m, 0):5d} {state}')
