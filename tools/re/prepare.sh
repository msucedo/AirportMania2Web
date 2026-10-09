#!/bin/sh
# Prepares the reverse-engineering work directory (.re/, not committed):
# extracts the executable from the IPA, thins it to armv7 and disassembles it.
# Usage: tools/re/prepare.sh /path/to/game.ipa
set -eu
ipa="${1:?usage: tools/re/prepare.sh /path/to/game.ipa}"
dir="${AM2_RE_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/.re}"
mkdir -p "$dir"
unzip -p "$ipa" 'Payload/AM2S.app/AM2S' > "$dir/AM2S_fat"
lipo "$dir/AM2S_fat" -thin armv7 -output "$dir/AM2S_armv7"
rm "$dir/AM2S_fat"
otool -arch armv7 -tV "$dir/AM2S_armv7" > "$dir/full_asm.txt"
AM2_RE_DIR="$dir" python3 -I "$(dirname "$0")/reidx.py" build
echo "ready: $dir"
