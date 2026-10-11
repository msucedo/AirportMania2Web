#!/usr/bin/env python3
"""Runs a draw (or update) routine in an emulator and reports every image it draws.

Usage: .tools/venv/bin/python -I tools/re/draw_trace.py <function> [field ...] [--r1 V] [--r2 V] [--r3 V]
                                                     [--app field ...] [--stub address ...] [--dump N]

The routine is called on a made-up object. Each field is `offset=value`, in hex and:
  1.5f        a float                 7        a whole number
  img:WxH     an image W by H (drawn through its vtable, which is how draws are caught)
  obj         a blank object of its own
--app sets fields of the application object (what `0x2ef4` returns) the same way, --r1 to --r3 the
other arguments (floats as 1.5f). The engine's own code is run for real, so the transforms are
the engine's; the maths library is answered by Python. Every virtual call on an image prints
the transform it was given: colour, opacity and the matrix as Pixi's a b c d tx ty
(x' = a·x + c·y + tx, y' = b·x + d·y + ty). --stub lists engine functions to log and skip
instead of running; --dump prints the first N words of the object afterwards, as floats.

Needs the Unicorn emulator: python3 -m venv .tools/venv && .tools/venv/bin/pip install unicorn
"""
import argparse, math, os, pickle, re, struct

from unicorn import Uc, UC_ARCH_ARM, UC_MODE_THUMB, UC_HOOK_CODE, UC_HOOK_MEM_UNMAPPED
from unicorn.arm_const import (UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3, UC_ARM_REG_SP, UC_ARM_REG_LR,
                               UC_ARM_REG_PC, UC_ARM_REG_C1_C0_2, UC_ARM_REG_FPEXC)

ROOT = os.environ.get('AM2_RE_DIR') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.re')
TEXT, DATA, DATA_SIZE = 0x1000, 0x176000, 0xc000
STACK, STACK_SIZE = 0x60000000, 0x100000
HEAP, HEAP_SIZE = 0x40000000, 0x100000
TRAP = 0x70000000
APP = 0x2ef4

f2i = lambda x: struct.unpack('<I', struct.pack('<f', x))[0]
i2f = lambda v: struct.unpack('<f', struct.pack('<I', v & 0xffffffff))[0]
d2i = lambda x: struct.unpack('<II', struct.pack('<d', x))
i2d = lambda lo, hi: struct.unpack('<d', struct.pack('<II', lo, hi))[0]

# The maths library: doubles travel in register pairs, floats in one register.
DOUBLE1 = {'_sin': math.sin, '_cos': math.cos, '_floor': math.floor, '_ceil': math.ceil, '_atan': math.atan, '_exp': math.exp,
           '_log': math.log, '_fabs': abs, '_acos': math.acos, '_exp2': lambda x: 2.0 ** x}
FLOAT1 = {'_sinf': math.sin, '_cosf': math.cos, '_floorf': math.floor, '_ceilf': math.ceil, '_sqrtf': math.sqrt}


class Run:
    def __init__(self, args):
        self.image = open(os.path.join(ROOT, 'AM2S_armv7'), 'rb').read()
        rows = pickle.load(open(os.path.join(ROOT, 'index.pkl'), 'rb'))['rows']
        self.stubs = {}
        for _, text in rows:
            m = re.match(r'blx?\s+0x([0-9a-f]+) @ symbol stub for: (\S+)', text)
            if m:
                self.stubs[int(m.group(1), 16)] = m.group(2)
        self.skip = {int(a, 16) for a in args.stub}
        self.heap = HEAP + 0x1000
        self.images, self.random = {}, 0
        uc = self.uc = Uc(UC_ARCH_ARM, UC_MODE_THUMB)
        uc.mem_map(0, 0x1000)
        uc.mem_map(TEXT, 0x175000)
        uc.mem_write(TEXT, self.image[:0x175000])
        uc.mem_map(DATA, DATA_SIZE)
        uc.mem_write(DATA, self.image[0x175000:0x175000 + 0x9000])
        uc.mem_map(STACK, STACK_SIZE)
        uc.mem_map(HEAP, HEAP_SIZE)
        uc.mem_map(TRAP, 0x1000)
        # A made-up object's vtable pointer is null: page zero sends every virtual call to the trap.
        uc.mem_write(0, struct.pack('<I', TRAP | 1) * 0x400)
        uc.reg_write(UC_ARM_REG_C1_C0_2, uc.reg_read(UC_ARM_REG_C1_C0_2) | (0xf << 20))
        uc.reg_write(UC_ARM_REG_FPEXC, 0x40000000)
        self.app = self.make(args.app, 0x800)
        self.object = self.make(args.fields, 0x800)
        uc.hook_add(UC_HOOK_CODE, self.on_code)
        uc.hook_add(UC_HOOK_MEM_UNMAPPED, self.on_unmapped)
        uc.reg_write(UC_ARM_REG_SP, STACK + STACK_SIZE - 0x1000)
        uc.reg_write(UC_ARM_REG_LR, (TRAP + 0x800) | 1)
        uc.reg_write(UC_ARM_REG_R0, self.object)
        for register, value in ((UC_ARM_REG_R1, args.r1), (UC_ARM_REG_R2, args.r2), (UC_ARM_REG_R3, args.r3)):
            if value is not None:
                uc.reg_write(register, self.word(value))
        self.error = None
        try:
            uc.emu_start(int(args.function, 16) | 1, TRAP + 0x800, count=20_000_000)
        except Exception as error:  # noqa: BLE001 - report where the run stopped
            self.error = self.error or f'{error} at {uc.reg_read(UC_ARM_REG_PC):#x}'
        print(f'returned {uc.reg_read(UC_ARM_REG_R0):#x}' if not self.error else f'# stopped: {self.error}')
        if args.dump:
            words = struct.unpack(f'<{args.dump}I', uc.mem_read(self.object, 4 * args.dump))
            print('object:', ' '.join(f'+{4 * i:#x}={w:#x}' + (f'({i2f(w):g})' if 0x30000000 < w & 0x7fffffff < 0x50000000 else '') for i, w in enumerate(words)))

    def alloc(self, size):
        at = self.heap
        self.heap += (size + 15) & ~15
        return at

    def word(self, text):
        if text.startswith('img:'):
            width, height = (int(n) for n in text[4:].split('x'))
            at = self.alloc(0x100)
            self.uc.mem_write(at + 4, struct.pack('<II', width, height))
            self.images[at] = text[4:]
            return at
        if text == 'obj':
            return self.alloc(0x400)
        return f2i(float(text[:-1])) if text.endswith('f') else int(text, 0) & 0xffffffff

    def make(self, fields, size):
        at = self.alloc(size)
        for field in fields:
            offset, value = field.split('=')
            self.uc.mem_write(at + int(offset, 16), struct.pack('<I', self.word(value)))
        return at

    def on_unmapped(self, uc, access, address, size, value, data):
        self.error = f'unmapped access to {address:#x} at {uc.reg_read(UC_ARM_REG_PC):#x}'
        return False

    def transform(self, at):
        flags, r, g, b, alpha = struct.unpack('<I4f', self.uc.mem_read(at, 20))
        m = struct.unpack('<9f', self.uc.mem_read(at + 0x14, 36))
        number = lambda x: f'{x:.6g}'
        return f'rgb {number(r)} {number(g)} {number(b)} alpha {number(alpha)} matrix ' + ' '.join(number(m[i]) for i in (0, 1, 3, 4, 6, 7))

    def on_code(self, uc, address, size, data):
        name = self.stubs.get(address)
        virtual = TRAP <= address < TRAP + 0x800
        if not (name or virtual or address == APP or address in self.skip):
            return
        lr = uc.reg_read(UC_ARM_REG_LR)
        regs = [uc.reg_read(r) for r in (UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3)]
        result = [0, None]
        if address == APP:
            result[0] = self.app
        elif virtual:
            if regs[0] in self.images and HEAP <= regs[1] < HEAP + HEAP_SIZE or STACK <= regs[1] < STACK + STACK_SIZE:
                print(f'draw {self.images.get(regs[0], hex(regs[0]))} {self.transform(regs[1])}')
            else:
                print(f'virtual call from {lr & ~1:#x} on {regs[0]:#x}: {regs[1]:#x} {regs[2]:#x} {regs[3]:#x}')
        elif address in self.skip:
            print(f'call {address:#x} from {lr & ~1:#x}: {regs[0]:#x} ' + ' '.join(f'{v:#x}({i2f(v):g})' for v in regs[1:]))
        elif name in DOUBLE1:
            result = list(d2i(DOUBLE1[name](i2d(regs[0], regs[1]))))
        elif name == '_pow':
            result = list(d2i(i2d(regs[0], regs[1]) ** i2d(regs[2], regs[3])))
        elif name in FLOAT1:
            result[0] = f2i(FLOAT1[name](i2f(regs[0])))
        elif name == '_powf':
            result[0] = f2i(i2f(regs[0]) ** i2f(regs[1]))
        elif name == '_rand':
            # Not the device's generator: a count, so that a routine's use of it shows in the output.
            self.random += 1
            result[0] = self.random
            print(f'rand #{self.random} from {lr & ~1:#x}')
        elif name in ('__Znwm', '__Znam', '_malloc'):
            result[0] = self.alloc(max(regs[0], 16) + 0x100)
        elif name == '___cxa_guard_acquire':
            result[0] = 1  # so that statics (the identity matrix) are set up
        elif name == '___cxa_guard_release':
            pass
        else:
            print(f'call {name} from {lr & ~1:#x}')
        uc.reg_write(UC_ARM_REG_R0, result[0])
        if result[1] is not None:
            uc.reg_write(UC_ARM_REG_R1, result[1])
        uc.reg_write(UC_ARM_REG_PC, lr | 1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('function')
    parser.add_argument('fields', nargs='*')
    parser.add_argument('--r1')
    parser.add_argument('--r2')
    parser.add_argument('--r3')
    parser.add_argument('--app', nargs='*', default=[])
    parser.add_argument('--stub', nargs='*', default=[])
    parser.add_argument('--dump', type=int, default=0)
    Run(parser.parse_args())
