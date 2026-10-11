"""Lists what the game's code names that its data has and the port's code never names:
tools/re/unused.py. Resources (images, sounds, fonts) and texts, with the functions naming them.
A name the binary builds with %d or %s is matched by its fixed start.
"""
import glob
import pickle
import re

ix = pickle.load(open('.re/index.pkl', 'rb'))
LOGIC = (0x2000, 0xE4000)

xml = re.sub(r'<!--.*?-->', '', open('public/assets/resources.xml', errors='replace').read(), flags=re.S)
have = set()
stack = []
for m in re.finditer(r'<(/?)(\w+)([^>]*?)(/?)>', xml):
    close, tag, attrs, alone = m.groups()
    name = re.search(r'Name="([^"]+)"', attrs)
    if close:
        if tag == 'NameSpace' and stack:
            stack.pop()
    elif tag == 'NameSpace' and not alone:
        stack.append(name.group(1) if name else '?')
    elif name:
        have.add('.'.join(stack + [name.group(1)]))
texts = set()
stack = []
for m in re.finditer(r'<(/?)(\w+)([^>]*?)(/?)>', open('public/assets/data/languages/english.xml', errors='replace').read()):
    close, tag, attrs, alone = m.groups()
    name = re.search(r'Name="([^"]+)"', attrs)
    if close:
        if tag == 'NameSpace' and stack:
            stack.pop()
    elif tag == 'NameSpace' and not alone:
        stack.append(name.group(1) if name else '?')
    elif name:
        texts.add('.'.join(stack + [name.group(1)]))

# What the port's code names: literals, with ${…} standing for anything.
patterns = []
plain = ''
for path in glob.glob('src/**/*.ts', recursive=True):
    if '/generated/' in path:
        continue
    source = open(path, errors='replace').read()
    plain += source
    for literal in re.findall(r"[`'\"]([A-Z][A-Z0-9_.]*(?:\$\{[^}`]*\}[A-Za-z0-9_.]*)*)[`'\"]", source):
        if '.' in literal or '${' in literal:
            patterns.append(re.compile(re.sub(r'\\\$\\\{.*?\\\}', '.*', re.escape(literal)) + r'(\..*)?$'))


def named(identifier):
    return identifier in plain or any(p.match(identifier) for p in patterns)


missing = {}
for address, refs in ix['sxref'].items():
    text = ix['strings'][address]
    if not re.fullmatch(r'[A-Z][A-Z0-9_]*(\.[A-Za-z0-9_%]+)+', text):
        continue
    users = sorted({f for _, f in refs if LOGIC[0] <= f < LOGIC[1]})
    if not users:
        continue
    start = re.split(r'%', text)[0]
    pool = have | texts
    found = [i for i in pool if i == text or ('%' in text and i.startswith(start))]
    if not found:
        continue
    if not any(named(i) for i in found):
        missing[text] = (users, 'text' if found[0] in texts and found[0] not in have else 'resource')
for text in sorted(missing):
    users, kind = missing[text]
    print(f'{kind:8s} {text:55s} {" ".join(f"{u:x}" for u in users[:5])}')
print(len(missing), 'named by the game, in its data, not named by the port')
