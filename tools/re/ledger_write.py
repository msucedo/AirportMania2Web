"""Writes docs/unread.tsv from the mechanical evidence and the decisions made by hand:
tools/re/ledger_write.py <evidence.tsv> <decisions.py> ...
A decision file calls put(category, note, address, ...). What no decision covers keeps the
mechanical guess, marked as such in its note.
"""
import re
import sys

M = {}
def put(category, note, *addresses):
    for address in addresses:
        M[address] = (category, note)

for path in sys.argv[2:]:
    exec(open(path).read())
rows = []
for line in open(sys.argv[1]):
    f = line.rstrip('\n').split('\t')
    address, size, guess = int(f[0], 16), int(f[1]), f[2]
    evidence = ' '.join(x for x in f[3:] if x)
    floats = int(f[3][7:])
    names = [s for s in f[7].split('; ') if s]
    if address in M:
        category, note = M[address]
    elif guess == '?' and names and all(re.fullmatch(r'[A-Z][A-Za-z]+(::[A-Za-z]+)?', s) for s in names) and floats == 0 and size <= 150:
        category, note = 'fontanería', 'by rule: names of types only'
    elif guess == '?' and size <= 48 and floats <= 2 and not names:
        category, note = 'fontanería', 'by rule: small helper'
    elif guess == 'fontanería?':
        category, note = 'fontanería', 'by rule: no numbers and no text'
    elif guess == 'cubierta?':
        category, note = 'cubierta', 'by rule: only loads resources or makes objects'
    else:
        category, note = 'sin clasificar', guess
    rows.append((address, size, category, note, evidence))
with open('docs/unread.tsv', 'w') as out:
    out.write('address\tbytes\tcategory\tnote\tevidence\n')
    for address, size, category, note, evidence in rows:
        out.write(f'{address:x}\t{size}\t{category}\t{note}\t{evidence}\n')
totals = {}
for _, size, category, _, _ in rows:
    count, total = totals.get(category, (0, 0))
    totals[category] = (count + 1, total + size)
for category, (count, total) in sorted(totals.items(), key=lambda item: -item[1][1]):
    print(f'{category:15s} {count:4d} {total:7d}')
