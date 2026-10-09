"""Local index over the otool disassembly: string xrefs, function bounds, call graph.
Usage: python3 -I tools/re/reidx.py build | strx <regex> | fn <addr> | strs <addr> | calls <addr> | callers <addr> | dis <addr> [maxlines]
"""
import sys, re, struct, pickle, os, bisect
# Work directory prepared by tools/re/prepare.sh (override with AM2_RE_DIR).
W = os.environ.get('AM2_RE_DIR') or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.re')
ASM, BIN, IDX = W + '/full_asm.txt', W + '/AM2S_armv7', W + '/index.pkl'
TEXT_VM = 0x1000  # __TEXT vmaddr; file offset 0 in the thin slice

def build():
    data = open(BIN, 'rb').read()
    rows = []
    for line in open(ASM, errors='replace'):
        p = line.rstrip('\n').split('\t')
        try: a = int(p[0], 16)
        except ValueError: continue
        rows.append((a, ' '.join(p[2:])))
    starts = [a for a, t in rows if re.match(r'push(\.w)?\s*\{.*lr\}', t)]
    # cstring section bounds from the known layout: scan printable runs in __TEXT after code
    code_end = rows[-1][0]
    strings = {}
    i = code_end - TEXT_VM
    end = 0x176000 - TEXT_VM
    while i < end:
        j = i
        while j < end and 32 <= data[j] < 127: j += 1
        if j - i >= 3 and j < end and data[j] == 0: strings[i + TEXT_VM] = data[i:j].decode('ascii')
        i = j + 1
    sxref, calls, callers = {}, {}, {}
    reg = {}
    cur = None; si = 0
    for a, t in rows:
        while si < len(starts) and starts[si] <= a:
            cur = starts[si]; si += 1; reg = {}
        m = re.match(r'movw\s+(r\d+), #0x([0-9a-f]+)', t)
        if m: reg[m.group(1)] = int(m.group(2), 16); continue
        m = re.match(r'movt\s+(r\d+), #0x([0-9a-f]+)', t)
        if m: reg[m.group(1)] = (reg.get(m.group(1), 0) & 0xffff) | int(m.group(2), 16) << 16; continue
        m = re.match(r'add\s+(r\d+), pc$', t)
        if m and m.group(1) in reg:
            tgt = (reg.pop(m.group(1)) + a + 4) & 0xffffffff
            if tgt in strings: sxref.setdefault(tgt, []).append((a, cur))
            continue
        m = re.match(r'blx?\s+0x([0-9a-f]+)', t)
        if m and cur is not None:
            tg = int(m.group(1), 16)
            calls.setdefault(cur, []).append((a, tg)); callers.setdefault(tg, []).append((a, cur))
    pickle.dump(dict(rows=rows, starts=starts, strings=strings, sxref=sxref, calls=calls, callers=callers), open(IDX, 'wb'))
    print('rows', len(rows), 'functions', len(starts), 'strings', len(strings), 'string xref targets', len(sxref))

def load(): return pickle.load(open(IDX, 'rb'))
def fn_of(ix, a):
    s = ix['starts']; i = bisect.bisect_right(s, a) - 1
    return s[i] if i >= 0 else None
def fn_end(ix, f):
    s = ix['starts']; i = bisect.bisect_right(s, f)
    return s[i] if i < len(s) else ix['rows'][-1][0]

def main():
    if len(sys.argv) < 2:
        print(__doc__.strip()); return
    cmd = sys.argv[1]
    if cmd == 'build': return build()
    ix = load()
    if cmd == 'strx':
        pat = re.compile(sys.argv[2])
        for addr, s in sorted(ix['strings'].items()):
            if pat.search(s):
                refs = ix['sxref'].get(addr, [])
                print(f'{addr:x} {s!r} <- ' + (', '.join(f'{a:x}(fn {f:x})' for a, f in refs) or 'no direct ref'))
    elif cmd == 'fn':
        a = int(sys.argv[2], 16); f = fn_of(ix, a); print(f'fn {f:x} .. {fn_end(ix, f):x} ({fn_end(ix, f) - f} bytes)')
    elif cmd == 'callers':
        a = int(sys.argv[2], 16)
        for site, f in ix['callers'].get(a, []): print(f'{site:x} in fn {f:x}')
    elif cmd == 'calls':
        f = int(sys.argv[2], 16)
        for site, tg in ix['calls'].get(f, []): print(f'{site:x} -> {tg:x}')
    elif cmd == 'strs':  # strings referenced by a function
        f = int(sys.argv[2], 16); e = fn_end(ix, f)
        out = [(a, addr) for addr, refs in ix['sxref'].items() for a, ff in refs if f <= a < e]
        for a, addr in sorted(out): print(f'{a:x} {ix["strings"][addr]!r}')
    elif cmd == 'dis':
        a = int(sys.argv[2], 16); n = int(sys.argv[3]) if len(sys.argv) > 3 else 80
        rows = ix['rows']; i = bisect.bisect_left(rows, (a, ''))
        noise = re.compile(r'__ZNSsD2Ev|Unwind_SjLj|str\s+r\d, \[r7, #-\d+\]$')
        pend = {}; k = 0
        while k < n and i < len(rows):
            ad, t = rows[i]; i += 1
            if noise.search(t): continue
            note = ''
            m = re.match(r'movw\s+(r\d+), #0x([0-9a-f]+)', t)
            if m: pend[m.group(1)] = int(m.group(2), 16)
            m = re.match(r'movs\s+(r\d+), #0x0$', t)
            if m: pend[m.group(1)] = 0
            m = re.match(r'movt\s+(r\d+), #0x([0-9a-f]+)', t)
            if m:
                v = int(m.group(2), 16) << 16 | (pend.get(m.group(1), 0) & 0xffff); pend[m.group(1)] = v
                note = f'   ; {struct.unpack("<f", struct.pack("<I", v))[0]:g}f'
            m = re.match(r'mov\.w\s+(r\d+), #0x([0-9a-f]{8})$', t)
            if m: note = f'   ; {struct.unpack("<f", struct.pack("<I", int(m.group(2), 16)))[0]:g}f'
            m = re.match(r'add\s+(r\d+), pc$', t)
            if m and m.group(1) in pend:
                tg = (pend[m.group(1)] + ad + 4) & 0xffffffff
                note = f'   ; -> {ix["strings"].get(tg, hex(tg))!r}'
            m = re.match(r'vldr\s+\S+, \[pc, #(\d+)\]', t)
            if m:
                lit = ((ad + 4) & ~3) + int(m.group(1))
                note = f'   ; lit {struct.unpack_from("<f", open(BIN,"rb").read(), lit - TEXT_VM)[0]:g}f'
            print(f'{ad:x} {t}{note}'); k += 1
main()
