#!/usr/bin/env python3
"""Makes the home-screen icons from one of the game's own pictures (the ending's main character
on a sky-blue square). They are written to public/icons/, which is not committed, like the assets.

Usage: python3 tools/make-icons.py        (needs Pillow; run after `npm run import-assets`)
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SOURCES = ['public/assets-hd/data/graphics/final_victory/main_character.png', 'public/assets/data/graphics/final_victory/main_character.png']
SKY = (150, 215, 245, 255)


def main():
    source = next((os.path.join(ROOT, p) for p in SOURCES if os.path.exists(os.path.join(ROOT, p))), None)
    if source is None:
        raise SystemExit('The game\'s pictures are not imported yet: run `npm run import-assets` first.')
    picture = Image.open(source).convert('RGBA')
    # Its face is in the middle of a wide picture: a square about the middle, a little above it.
    side = min(picture.width, picture.height)
    left = (picture.width - side) // 2
    top = max(0, min(picture.height - side, (picture.height - side) // 2))
    face = picture.crop((left, top, left + side, top + side))
    out = os.path.join(ROOT, 'public', 'icons')
    os.makedirs(out, exist_ok=True)
    for size in (180, 192, 512):
        icon = Image.new('RGBA', (size, size), SKY)
        scaled = face.resize((size, size), Image.LANCZOS)
        icon.alpha_composite(scaled)
        icon.convert('RGB').save(os.path.join(out, f'icon-{size}.png'))
        print(f'public/icons/icon-{size}.png')


if __name__ == '__main__':
    main()
