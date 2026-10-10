#!/usr/bin/env python3
"""Runs a compiled stage script in an emulator and reports what it builds.

Usage: .tools/venv/bin/python -I tools/re/stage_layout.py <script> [--stage N] [--level N]
                                                         [--own id,id,...] [--all] [--raw] [--floats]

The script (a hex address such as 0xce178 for Arches) is executed on the thinned armv7 slice
with a made-up airport, profile and level record. Every call that leaves the stage scripts'
own code is intercepted: its arguments are written down (registers, outgoing stack words, and
what any of them point to: positions, numbers, texts) and it returns a blank object, so the
script carries on. That gives the real arguments of every builder call, with no guessing about
which register held what.

--own sets the improvements the level record holds, --level the level number. With --all the
script is run once with nothing owned and once more for each improvement id it tests, and the
differences are listed, which shows what each improvement adds, removes or changes.

--offers works out when each improvement is put on sale: the script registers some only when
another is owned and withdraws some while another is. It runs the script for every combination
of the improvements that matter and prints, per offer, which must be owned and which must not.

Needs the Unicorn emulator: python3 -m venv .tools/venv && .tools/venv/bin/pip install unicorn
"""
import argparse, os, pickle, re, struct, sys

from unicorn import Uc, UC_ARCH_ARM, UC_MODE_THUMB, UC_HOOK_CODE, UC_HOOK_MEM_WRITE, UC_HOOK_MEM_UNMAPPED
from unicorn.arm_const import (UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3, UC_ARM_REG_SP, UC_ARM_REG_LR,
                               UC_ARM_REG_PC, UC_ARM_REG_CPSR, UC_ARM_REG_S0, UC_ARM_REG_C1_C0_2, UC_ARM_REG_FPEXC)

ROOT = os.environ.get('AM2_RE_DIR') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.re')
TEXT, DATA, DATA_SIZE = 0x1000, 0x176000, 0xc000
STACK, STACK_SIZE = 0x60000000, 0x100000
HEAP, HEAP_SIZE = 0x40000000, 0x1000000
TRAP = 0x70000000
# Code that belongs to the stage scripts and their local helpers, and so is run for real.
NATIVE = (0xcde40, 0xe4704)  # from the tutorial's script to the end of Mars's
# Engine code that is also run for real: the level's random generator (a Mersenne Twister the
# script seeds with stage * 100 + level), whose numbers decide when the bonus events start.
ALSO_NATIVE = ((0xa2724, 0xa2888),)

# Engine functions the scripts call, by what they build.
BUILDERS = {
    0x12ddc: 'beginStage', 0x12f90: 'serviceTabs', 0x1328c: 'image', 0x13458: 'improvement', 0x135f4: 'sky',
    0x13de4: 'scaledImage', 0x1404c: 'depthImage', 0x141ac: 'gate', 0x1428c: 'hangar', 0x1434c: 'gasStation',
    0x1440c: 'runway', 0x144e4: 'stopSpot', 0x145a8: 'paintingSpot', 0x147f8: 'taxiNode', 0x14808: 'linkNodes',
    0xcda08: 'clouds', 0x139fc: 'helicopterBonus', 0x13ac4: 'balloonsBonus', 0x14678: 'washAndGo',
}
# Stack words each builder really takes; the rest of the outgoing area is left over from before.
STACK_WORDS = {'helicopterBonus': 1, 'balloonsBonus': 1, 'washAndGo': 2, 'improvement': 4, 'gate': 1, 'runway': 1, 'stopSpot': 1, 'paintingSpot': 2, 'serviceTabs': 3, 'hangar': 1, 'gasStation': 1}
DEFAULT_STACK_WORDS = 0
# Calls that are plumbing and say nothing about the airport.
QUIET = {0x2ef4, 0x2ca4, 0x827a8, 0x821b8, 0x2aa0, 0xa3490, 0xa31d0}


class Run:
    def __init__(self, script, stage, level, owned):
        self.ix = pickle.load(open(os.path.join(ROOT, 'index.pkl'), 'rb'))
        self.image = open(os.path.join(ROOT, 'AM2S_armv7'), 'rb').read()
        self.strings = self.ix['strings']
        self.stubs = {}
        for _, text in self.ix['rows']:
            m = re.match(r'blx?\s+0x([0-9a-f]+) @ symbol stub for: (\S+)', text)
            if m:
                self.stubs[int(m.group(1), 16)] = m.group(2)
        self.calls, self.objects, self.unknown = [], {}, {}
        self.heap = HEAP + 0x1000
        uc = self.uc = Uc(UC_ARCH_ARM, UC_MODE_THUMB)
        uc.mem_map(0, 0x1000)
        uc.mem_map(TEXT, 0x175000)
        uc.mem_write(TEXT, self.image[:0x175000])
        uc.mem_map(DATA, DATA_SIZE)
        uc.mem_write(DATA, self.image[0x175000:0x175000 + 0x9000])
        uc.mem_map(STACK, STACK_SIZE)
        uc.mem_map(HEAP, HEAP_SIZE)
        uc.mem_map(TRAP, 0x1000)
        # A blank object's vtable pointer is null: page zero sends every virtual call to the trap.
        uc.mem_write(0, struct.pack('<I', TRAP | 1) * 0x400)
        # Enable the floating-point unit.
        uc.reg_write(UC_ARM_REG_C1_C0_2, uc.reg_read(UC_ARM_REG_C1_C0_2) | (0xf << 20))
        uc.reg_write(UC_ARM_REG_FPEXC, 0x40000000)

        # The made-up world: a profile on a stage and level, its record with the owned
        # improvements, the application and the airport being built.
        self.airport = self.alloc(0x2000)
        self.app = self.alloc(0x400)
        self.profile = self.alloc(0x100)
        self.record = self.alloc(0x100)
        ids = self.alloc(4 * max(1, len(owned)))
        uc.mem_write(ids, b''.join(struct.pack('<I', i) for i in owned))
        self.w32(self.record + 0x3c, ids)
        self.w32(self.record + 0x40, ids + 4 * len(owned))
        self.w32(self.profile + 0x1c, stage)
        self.w32(self.profile + 0x20, level)
        uc.mem_write(self.profile + 0x48, struct.pack('<f', 1.0))
        self.w32(self.app + 0xfc, self.airport)
        self.w32(self.airport + 0x64, level)
        self.fixed = {0x2ef4: self.app, 0x2ca4: self.profile, 0x827a8: self.profile, 0x821b8: self.record}

        uc.hook_add(UC_HOOK_CODE, self.on_code)
        uc.hook_add(UC_HOOK_MEM_WRITE, self.on_write, begin=HEAP, end=HEAP + HEAP_SIZE)
        uc.hook_add(UC_HOOK_MEM_UNMAPPED, self.on_unmapped)
        uc.reg_write(UC_ARM_REG_SP, STACK + STACK_SIZE - 0x1000)
        uc.reg_write(UC_ARM_REG_LR, (TRAP + 0x800) | 1)
        uc.reg_write(UC_ARM_REG_R0, self.airport)
        self.error = None
        try:
            uc.emu_start(script | 1, TRAP + 0x800, count=5_000_000)
        except Exception as error:  # noqa: BLE001 - report where the run stopped
            self.error = f'{error} at {uc.reg_read(UC_ARM_REG_PC):#x}'

    # --- memory helpers -------------------------------------------------------------------
    def alloc(self, size):
        at = self.heap
        self.heap += (size + 15) & ~15
        return at

    def w32(self, at, value):
        self.uc.mem_write(at, struct.pack('<I', value & 0xffffffff))

    def r32(self, at):
        return struct.unpack('<I', self.uc.mem_read(at, 4))[0]

    def mapped(self, at):
        return STACK <= at < STACK + STACK_SIZE - 16 or HEAP <= at < HEAP + HEAP_SIZE - 16

    def text_at(self, at):
        if at in self.strings:
            return self.strings[at]
        if TEXT <= at < TEXT + 0x175000:
            raw = self.image[at - TEXT:at - TEXT + 80].split(b'\0')[0]
            if len(raw) >= 3 and all(32 <= c < 127 for c in raw):
                return raw.decode()
        return None

    def describe(self, value, depth=0):
        """A register or stack word as a number, a text, or what it points to."""
        text = self.text_at(value)
        if text is not None:
            return repr(text)
        if value in self.objects:
            return f'<{self.objects[value]}>'
        if value == self.airport:
            return '<airport>'
        if self.mapped(value) and depth < 2:
            words = struct.unpack('<4I', self.uc.mem_read(value, 16))
            inner = self.text_at(words[0])
            if inner is not None:
                return f'&{inner!r}'
            return '&[' + ' '.join(self.describe(w, depth + 1) for w in words) + ']'
        if value >= 0xfffff000:
            return str(value - (1 << 32))
        if value > 0xffff:
            number = struct.unpack('<f', struct.pack('<I', value))[0]
            if number == number and 1e-4 < abs(number) < 1e7:
                return f'{number:g}f'
            return hex(value)
        return str(value)

    # --- hooks ----------------------------------------------------------------------------
    def on_unmapped(self, uc, access, address, size, value, data):
        self.error = f'unmapped access to {address:#x} at {uc.reg_read(UC_ARM_REG_PC):#x}'
        return False

    def on_write(self, uc, access, address, size, value, data):
        # What the script sets on an object a builder handed back.
        for base, name in self.objects.items():
            if base <= address < base + 0x800:
                pc = uc.reg_read(UC_ARM_REG_PC)
                if NATIVE[0] <= pc < NATIVE[1]:
                    self.calls.append({'pc': pc, 'name': f'set {name}+{address - base:#x}', 'args': [self.describe(value & 0xffffffff)]})
                return

    def on_code(self, uc, address, size, data):
        if NATIVE[0] <= address < NATIVE[1] and address not in BUILDERS:
            return
        if any(lo <= address < hi for lo, hi in ALSO_NATIVE):
            return
        lr = uc.reg_read(UC_ARM_REG_LR)
        if address == TRAP + 0x800:
            return
        regs = [uc.reg_read(r) for r in (UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3)]
        sp = uc.reg_read(UC_ARM_REG_SP)
        result = 0
        name = self.stubs.get(address)
        if name in ('__Znwm', '__Znam', '_malloc'):
            result = self.alloc(max(regs[0], 16) + 0x800)
        elif name == '_strlen':
            result = len(bytes(uc.mem_read(regs[0], 256)).split(b'\0')[0]) if regs[0] else 0
        elif name == '_memset':
            if regs[2] and self.mapped(regs[0]):
                uc.mem_write(regs[0], bytes([regs[1] & 0xff]) * min(regs[2], 0x10000))
            result = regs[0]
        elif name in ('_memcpy', '_memmove'):
            if regs[2] and self.mapped(regs[0]):
                uc.mem_write(regs[0], bytes(uc.mem_read(regs[1], min(regs[2], 0x10000))))
            result = regs[0]
        elif name in ('___divsi3', '___udivsi3', '___modsi3', '___umodsi3'):
            signed = 'u' not in name[3:5]
            a, b = regs[0], regs[1]
            if signed:
                a, b = (a - (1 << 32) if a & 0x80000000 else a), (b - (1 << 32) if b & 0x80000000 else b)
            if b == 0:
                result = 0
            else:
                quotient = abs(a) // abs(b) * (1 if (a < 0) == (b < 0) else -1)
                result = (quotient if 'div' in name else a - quotient * b) & 0xffffffff
        elif name and ('ZNSsC' in name or 'ZNSs6assign' in name):
            # A string made from a C string: keep the pointer so the text can be shown later.
            if self.mapped(regs[0]):
                self.w32(regs[0], regs[1])
            result = regs[0]
        elif name is not None:
            result = 0
        elif address in self.fixed:
            result = self.fixed[address]
        elif address == 0x2aa0:
            result = regs[1]  # string lookup: hand the id back as the text
        else:
            label = BUILDERS.get(address) or ('virtual' if TRAP <= address < TRAP + 0x800 else f'fn_{address:x}')
            if address not in QUIET:
                stack = [self.r32(sp + 4 * i) for i in range(8)]
                args = [self.describe(v) for v in regs[1:]] + ['|'] + [self.describe(v) for v in stack]
                s0 = struct.unpack('<f', struct.pack('<I', uc.reg_read(UC_ARM_REG_S0) & 0xffffffff))[0]
                self.calls.append({'pc': lr & ~1, 'name': label, 'args': args, 'this': self.describe(regs[0]), 's0': s0, 'words': list(regs[1:4]) + stack[:6]})
                if address not in BUILDERS:
                    self.unknown[address] = self.unknown.get(address, 0) + 1
            result = self.alloc(0x800)
            self.objects[result] = f'{label}#{sum(1 for c in self.calls if c["name"] == label)}'
        uc.reg_write(UC_ARM_REG_R0, result)
        uc.reg_write(UC_ARM_REG_PC, lr | 1)


FLOATS = False


def line(call, raw):
    args = call['args']
    if not raw and '|' in args:
        keep = STACK_WORDS.get(call['name'], DEFAULT_STACK_WORDS if call['name'] in BUILDERS else 4)
        args = args[:args.index('|') + 1 + keep]
        if args[-1] == '|':
            args = args[:-1]
    text = f"{call['name']:14s} {' '.join(args)}"
    if FLOATS and 'words' in call:
        # Every word as a float too: one whose bits happen to be a mapped address shows above as a pointer.
        as_float = lambda v: f"{struct.unpack('<f', struct.pack('<I', v))[0]:.6g}"
        words = call['words']
        text += '   # floats: ' + ' '.join(as_float(v) for v in words[:3]) + ' | ' + ' '.join(as_float(v) for v in words[3:])
    return text


def tested_ids(run, script):
    """Improvement ids the script compares against, from its own code."""
    rows = run.ix['rows']
    end = min((a for a in run.ix['starts'] if a > script), default=script + 0x4000)
    ids = set()
    for address, text in rows:
        if script <= address < end:
            m = re.match(r'cmp(?:\.w)?\s+r\d+, #0x([0-9a-f]+)$', text)
            if m:
                ids.add(int(m.group(1), 16))
    return sorted(i for i in ids if i < 0x200)


def offered(run):
    """Ids of the improvements a run registered, with price and first level recommended."""
    out = {}
    for call in run.calls:
        if call['name'] == 'improvement':
            args = call['args']
            words = args[args.index('|') + 1:]
            out[int(args[0], 0)] = (int(args[1], 0), words[3] if len(words) > 3 else '?', args[2])
    return out


def offers(script, stage, level):
    from itertools import combinations
    base = Run(script, stage, level, [])
    everything = dict(offered(base))
    singles = {}
    for extra in tested_ids(base, script):
        seen = offered(Run(script, stage, level, [extra]))
        everything.update(seen)
        if set(seen) != set(offered(base)):
            singles[extra] = seen
    relevant = sorted(singles)
    # Owning one improvement can bring in an offer that a further one brings in turn.
    grew = True
    while grew:
        grew = False
        for extra in tested_ids(base, script):
            if extra in relevant:
                continue
            with_all = offered(Run(script, stage, level, relevant))
            more = offered(Run(script, stage, level, relevant + [extra]))
            everything.update(with_all)
            everything.update(more)
            if set(with_all) != set(more):
                relevant.append(extra)
                grew = True
    relevant.sort()
    table = {}
    for size in range(len(relevant) + 1):
        for owned in combinations(relevant, size):
            seen = offered(Run(script, stage, level, list(owned)))
            everything.update(seen)
            table[frozenset(owned)] = set(seen)
    print(f'# script {script:#x}, stage {stage}, level {level}; improvements that affect what is on sale: {[hex(i) for i in relevant]}')
    for offer in sorted(everything, key=lambda i: list(everything).index(i)):
        price, recommended, icon = everything[offer]
        shown = [owned for owned, ids in table.items() if offer in ids]
        needs = [i for i in relevant if shown and all(i in owned for owned in shown)]
        hides = [i for i in relevant if shown and not any(i in owned for owned in shown)]
        rule = lambda owned: all(i in owned for i in needs) and not any(i in owned for i in hides)  # noqa: E731
        exact = all((offer in ids) == rule(owned) for owned, ids in table.items())
        note = '' if exact else '   (not a simple rule: check by hand)'
        print(f"{offer:#04x} price {price:6d} recommended from level {recommended:>4} {icon:42s} needs {[hex(i) for i in needs]} hidden by {[hex(i) for i in hides]}{note}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('script')
    parser.add_argument('--stage', type=int, default=1)
    parser.add_argument('--level', type=int, default=1)
    parser.add_argument('--own', default='')
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--raw', action='store_true')
    parser.add_argument('--floats', action='store_true', help='show every argument word as a float as well')
    parser.add_argument('--offers', action='store_true')
    parser.add_argument('--only', default='', help='comma-separated call names to show')
    options = parser.parse_args()
    script = int(options.script, 16)
    if options.offers:
        offers(script, options.stage, options.level)
        return
    owned = [int(x, 0) for x in options.own.split(',') if x]
    only = {x for x in options.only.split(',') if x}
    keep = lambda call: not only or call['name'] in only  # noqa: E731

    base = Run(script, options.stage, options.level, owned)
    global FLOATS
    FLOATS = options.floats
    lines = [line(c, options.raw) for c in base.calls if keep(c)]
    print(f'# script {script:#x}, stage {options.stage}, level {options.level}, owned {[hex(i) for i in owned]}')
    for call, text in zip([c for c in base.calls if keep(c)], lines):
        print(f"{call['pc']:x} {text}")
    if base.error:
        print('# stopped:', base.error)
    if base.unknown:
        print('# calls without a name:', ' '.join(f'{a:#x}x{n}' for a, n in sorted(base.unknown.items())))
    if not options.all:
        return
    for extra in tested_ids(base, script):
        if extra in owned:
            continue
        other = Run(script, options.stage, options.level, owned + [extra])
        theirs = [line(c, options.raw) for c in other.calls if keep(c)]
        gone = [t for t in lines if t not in theirs]
        new = [t for t in theirs if t not in lines]
        if not gone and not new:
            continue
        print(f'\n# owning {extra:#x}:')
        for t in gone:
            print('  -', t)
        for t in new:
            print('  +', t)
        if other.error:
            print('  # stopped:', other.error)


main()
