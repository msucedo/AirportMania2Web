#!/usr/bin/env python3
"""Builds an optional higher-resolution copy of the game's images with Real-ESRGAN.

Usage: python3 tools/upscale-assets.py [path-to-realesrgan-ncnn-vulkan]

Every image under public/assets/ is enlarged four times with the `realesrgan-x4plus-anime` model
and stored at twice its size under public/assets-hd/, with the same relative path, plus a
manifest the game reads to know which files have an enlarged version. The originals are not
touched and the game runs without this step; the enlarged art is an interpretation, not the
original pixels. Needs Pillow and the Real-ESRGAN command-line build (by default in
.tools/realesrgan/). Directories already done are skipped; delete public/assets-hd to redo all.
"""
import json, os, shutil, subprocess, sys, tempfile
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SOURCE = os.path.join(ROOT, 'public', 'assets')
TARGET = os.path.join(ROOT, 'public', 'assets-hd')
TOOL = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '.tools', 'realesrgan', 'realesrgan-ncnn-vulkan')
MODEL = 'realesrgan-x4plus-anime'
SCALE = 2
EXTENSIONS = ('.png', '.jpg')

if not os.path.exists(TOOL):
    sys.exit(f'Real-ESRGAN not found at {TOOL}')

done = 0
for directory, _, names in sorted(os.walk(SOURCE)):
    images = sorted(n for n in names if n.lower().endswith(EXTENSIONS))
    if not images:
        continue
    relative = os.path.relpath(directory, SOURCE)
    out = os.path.join(TARGET, relative)
    if all(os.path.exists(os.path.join(out, n)) for n in images):
        done += len(images)
        continue
    os.makedirs(out, exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        # The tool takes a flat folder; only this directory's images go in.
        source, enlarged = os.path.join(work, 'in'), os.path.join(work, 'out')
        os.makedirs(source)
        os.makedirs(enlarged)
        for name in images:
            shutil.copy(os.path.join(directory, name), os.path.join(source, name))
        subprocess.run([TOOL, '-i', source, '-o', enlarged, '-n', MODEL, '-s', '4', '-f', 'png'],
                       cwd=os.path.dirname(TOOL), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for name in images:
            original = Image.open(os.path.join(directory, name))
            result = Image.open(os.path.join(enlarged, os.path.splitext(name)[0] + '.png'))
            size = (original.width * SCALE, original.height * SCALE)
            # Keep the original's kind of image: greyscale masks stay greyscale, JPEGs stay JPEG.
            mode = 'RGBA' if original.mode in ('RGBA', 'LA', 'P') else original.mode
            result = result.convert(mode).resize(size, Image.LANCZOS)
            if name.lower().endswith('.jpg'):
                result.convert('RGB').save(os.path.join(out, name), quality=93)
            else:
                result.save(os.path.join(out, name), optimize=True)
    done += len(images)
    print(f'{done:5d}  {relative}', flush=True)

files = sorted(
    os.path.relpath(os.path.join(d, n), TARGET).replace(os.sep, '/')
    for d, _, names in os.walk(TARGET) for n in names if n.lower().endswith(EXTENSIONS)
)
with open(os.path.join(TARGET, 'manifest.json'), 'w') as f:
    json.dump({'scale': SCALE, 'model': MODEL, 'files': files}, f)
print(f'{len(files)} images at {SCALE}x in public/assets-hd/')
