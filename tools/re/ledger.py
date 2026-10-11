"""Gathers what can be told mechanically about every uncited real function of the game logic:
tools/re/ledger.py > evidence. One line each: address, size, a first guess at what it is, and
the evidence (who calls it, whether a table of functions holds it, what it calls of the engine,
its numbers and its text). The guesses are a start for docs/unread.tsv, not a verdict.
"""
import contextlib
import io
import runpy
import struct
import sys

sys.argv = ['audit.py', '--check', '0x2160']
with contextlib.redirect_stdout(io.StringIO()):
    g = runpy.run_path('tools/re/audit.py')
ix, size, classify, body, strings = g['ix'], g['size'], g['classify'], g['body'], g['strings']
known = g['cited']()
LOGIC = g['LOGIC']

# Functions held in tables of the data segment (vtables and the like).
image = open('.re/AM2S_armv7', 'rb').read()
held = {}
for offset in range(0x175000, len(image) - 4, 4):
    value = struct.unpack_from('<I', image, offset)[0]
    if value & 1 and LOGIC[0] <= value - 1 < LOGIC[1]:
        held.setdefault(value - 1, []).append(offset + 0x1000)

# Every branch to an address, whatever its condition: the index only has plain calls.
reached = {}
for line in open('.re/full_asm.txt', errors='replace'):
    parts = line.rstrip('\n').split('\t')
    if len(parts) > 3 and parts[2].startswith('b') and parts[3].startswith('0x'):
        try:
            reached.setdefault(int(parts[3].split()[0], 16), []).append(int(parts[0], 16))
        except ValueError:
            pass
# Addresses the code forms for itself (movw, movt, add pc): how factories and handlers are registered.
import re
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
            value = (pending.pop(register) + int(parts[0], 16) + 4) & 0xffffffff
            if value & 1:
                formed.setdefault(value - 1, []).append(int(parts[0], 16))
functions = sorted(size)
import bisect
owner = lambda address: functions[bisect.bisect_right(functions, address) - 1]

DRAW = {0xb3e80, 0xb3ed0, 0xb40e4, 0xb41e0, 0xb4114, 0xb4240, 0xb4290, 0xb42f8, 0xb4318, 0xb3f20, 0x94650, 0x95134, 0xe4850, 0xe4a28}
LOAD = {0xa4f30, 0xa537c, 0xa559c, 0xa2e4c, 0xa2e7c}
SOUND = {0x8caa4}
STATE = {0x827a8: 'profile', 0x9db0: 'award', 0x9d60: 'award', 0x2ca4: 'users'}
TOUCH = {0xab400, 0xabc0c, 0xabc38, 0xabc64}
APART = ('http', 'facebook', 'Facebook', 'save%d', '.dat', 'LEADERBOARD', 'Leaderboard', 'ACHIEVEMENT', 'Achievement', 'GameCenter', 'UPSELL', 'Upsell', 'beta', 'Splash', 'MORE_GAMES', 'TRY_PC')

for function in sorted(f for f in size if LOGIC[0] <= f < LOGIC[1]):
    if function in known or classify(function)[0] != 'real':
        continue
    code = body(function)
    floats = sum(1 for m, _ in code if m.startswith('v') and m not in ('vpush', 'vpop', 'vorr'))
    callers = sorted({c for _, c in ix['callers'].get(function, [])} | {owner(a) for a in reached.get(function, []) if owner(a) != function})
    callees = {int(o.split()[0], 16) for m, o in code if m in ('bl', 'b', 'b.w') and o.startswith('0x') and '@' not in o}
    own = strings.get(function, [])
    news = sum(1 for m, o in code if m == 'blx' and '__Znwm' in o)
    tags = []
    if callees & DRAW:
        tags.append('draws')
    if callees & LOAD:
        tags.append('loads')
    if callees & SOUND:
        tags.append('sound')
    if callees & TOUCH:
        tags.append('touch')
    tags += [name for address, name in STATE.items() if address in callees]
    if news:
        tags.append(f'new×{news}')
    stores = sum(1 for m, o in code if m.startswith(('str', 'vstr')) and '[sp' not in o and 'sp,' not in o.split('[')[-1])
    tags.append(f'stores={stores}')
    tables = held.get(function, [])
    makers = formed.get(function, [])
    if makers:
        tags.append('formed@' + ','.join(f'{a:x}' for a in makers[:2]))
    if not callers and not tables and not makers:
        guess = 'muerta?'
    elif any(any(k in s for k in APART) for s in own):
        guess = 'no aplica?'
    elif 'draws' in tags and not ({'profile', 'award'} & set(tags)):
        guess = 'vista?'
    elif {'profile', 'award', 'touch'} & set(tags):
        guess = 'regla?'
    elif floats == 0 and not own:
        guess = 'fontanería?'
    elif 'loads' in tags or news:
        guess = 'cubierta?'
    else:
        guess = '?'
    marks = ' '.join(f'{c:x}{"*" if c in known else ""}' for c in callers[:6])
    print('\t'.join([f'{function:x}', str(size[function]), guess, f'floats={floats}', ','.join(tags), f'<- {marks}', f'tables={len(tables)}', '; '.join(own)[:90]]))
