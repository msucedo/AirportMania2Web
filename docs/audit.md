# What of the binary has not been read

An audit of the game-logic part of the binary (`0x2000`–`0x8c000`), made with
`tools/re/audit.py` on 2026-10-10. It answers how much of that code the port has read, and
lists what it has not.

## How it is counted

- A function is **cited** when an address inside it appears in `docs/re-notes.md`, in `src/`
  or in `tools/`. This is strict: a function the port reproduces without ever naming its
  address counts as not read.
- A function that is not cited is sorted by mechanical rules into:
  - **filler**: what the compiler writes for every class and call, with no behaviour of its
    own. Tiny functions (24 bytes or less); destructors (they free memory, with no numbers,
    no text and at most three other calls); guarded wrappers of a single call; small
    accessors; and destructors that only tear their members down (guarded, with landing pads,
    no numbers, no text, nothing allocated, at most six calls, 420 bytes or less);
  - **template**: instances of the standard containers;
  - **real**: everything else.
- The rules err. Run on the 494 cited functions, which are known to be real, they call 76 of
  them filler: 7 124 of 204 044 bytes, 3.5%. They are small functions (a field read, a
  two-line handler). So a few per cent of what is listed as filler below is real, and the
  figures are to the nearest few per cent, not exact.

## Figures

| | functions | bytes | share |
|---|---|---|---|
| Cited | 494 | 204 044 | 36.1% |
| Filler | 1 221 | 144 090 | 25.5% |
| Template | 50 | 25 824 | 4.6% |
| Real, not cited | 866 | 191 362 | 33.9% |
| All | 2 631 | 565 320 | |

Leaving filler and templates out, **51.6%** of the logic has been read (204 044 of 395 406
bytes). The other 48.4% is in 188 runs between cited functions; 49 of them are 1 000 bytes or
more and hold 153 958 of the 191 362 bytes.

The rest of the binary is not game logic: the stage scripts (`0xcc000`–`0xe4000`, 92% cited),
the engine (`0x8c000`–`0xcc000`, 262 KB) and third-party libraries (`0xe4000` on, 352 KB),
whose work the browser and PixiJS do.

## The large runs, and what each is

Identified by the text each run names and by who calls it; none has been read through. "In
the data" means its images or texts are in this build's resources.

### Behaviour the port lacks

| Run | Bytes | What it seems to be | In the data |
|---|---|---|---|
| `0xc01c`–`0xfe8c` | 11 404 | The plane's information dialog (`PLANE_INFO_DIALOG`: passengers, patience, loading speed…), among other level code. `0xdbfc` builds it; the awards notice calls it for a plane trophy. | yes |
| `0x342a4`–`0x36dd8` | 7 912 | The ending (`FINAL_VICTORY`): sky, little planes, the main character, its music. Called from the profile and the tutorial's end. | yes |
| `0x53ce4`–`0x565e4` | 5 848 | The loading screen: "fasten your seat belts", a belt with its pins. | yes |
| `0x5ddf4`–`0x5f420`, `0x614f4`–`0x63c38`, `0x5d2c8`–`0x5db60` | 11 444 | The map's own life: bats, birds, snow, a satellite, the carrier's waves, a propeller, the stage's ribbon. | yes |
| `0x26450`–`0x27b9c` | 3 996 | The colour palette dialog of the options (`PALETTE_SELECTION_DIALOG`, `GUI.COLOR_HELP`), a combo's explosion, the bonus coin's class. | yes |
| `0x69170`–`0x6a200` | 3 204 | Effects: a fan of light, a bonus star, sparks; and parts of the painting stop spot. | yes |
| `0x378c8`–`0x39474` | 2 728 | Fireworks (thrown by the awards notice, `0x38bbc`), and the finish-game dialog. | yes |
| `0x6bfb4`–`0x6cbf0`, `0x79a80`–`0x79e88` | 3 816 | The opening logos (`REFLEXIVE_INTRO`, `SWG_INTRO`), a radar, the order flags' class. | yes |
| `0x3710c`–`0x37604` | 1 080 | The questions before going to the map or restarting a level (`GO_TO_MAP_LEVEL_DIALOG`, `RESTART_LEVEL_DIALOG`). | yes |
| `0x6a328`–`0x6a9a0` | 1 292 | The message that perfect scores have unlocked something (`PERFECT_SCORES_UNLOCKED_MESSAGE`). | yes |
| `0x2472c`–`0x25150` | 1 348 | What Coffee and Cake and In-Flight Movies show: a message that can be touched, with a speech bubble. | yes |
| `0x22a64`–`0x23264` | 1 328 | Bats and birds over an airport (`BIRD.%d`), a black cover. | yes |
| `0x75db8`–`0x765d8` | 1 284 | Black smoke (`EFFECTS.SMOKE_BLACK`), beside the smoke tail already built. | yes |
| `0x712c4`–`0x71e50` | 2 336 | A score message in the large font, an error dialog for a save that cannot be loaded. | partly |
| `0x3e71c`–`0x404fc` | 4 036 | Start-up: the build's settings and expiry, and `GameTip`, the tips shown in a level (`0x40314`). | partly |

### Code for things this build's data does not have

| Run | Bytes | What it seems to be |
|---|---|---|
| `0x869c8`–`0x87984` | 2 224 | Silhouettes under the island's water (`STAGES.ISLAND.WATER_SILHOUETTE`): no such images. |
| `0x234e0`–`0x24010` | 1 932 | A Christmas tree with coloured lights at the North Pole: no such images. Buoys, which the port has. |
| `0x592cc`–`0x597b0` | 964 | A lunar buggy bonus: no such images. One of the two bonus classes found posting the bonus award. |

### Not applicable to the web version

| Run | Bytes | What it is |
|---|---|---|
| `0x87b4c`–`0x8c1a8` | 10 088 | Reading and writing saved objects, with compression; a river. |
| `0x3b234`–`0x3cb90` | 6 292 | The build's configuration: upselling, beta, splash, stage count. |
| `0x5a1c8`–`0x5bf70` | 5 892 | The main menu's links out: more games, Facebook. |
| `0x1fb4c`–`0x218c0`, `0x2f60c`–`0x3132c` | 6 932 | The online leaderboard and achievements. |
| `0x12540`–`0x12ddc`, `0x82a70`–`0x83d98` | 4 052 | Save files (`save%d.dat`) and the profile on disk. |
| `0x3a804`–`0x3b190` | 2 064 | Game Center achievement names, a frame counter. |

### Covered another way

| Run | Bytes | What it is |
|---|---|---|
| `0x571d4`–`0x59140`, `0x47888`–`0x49518`, `0x43f94`–`0x45b3c`, `0x41128`–`0x42814`, `0x6e6b8`–`0x6f5bc`, `0xb8ac`–`0xbdb8`, `0x52270`–`0x53078` | 21 630 | The parsers of the descriptor tables and the levels database. The importer reads the same files. |
| `0x2d17c`–`0x2dbf8`, `0x2c8ac`–`0x2cf54`, `0x2de10`–`0x2e1e8`, `0x2ee44`–`0x2f0e8` | 5 672 | The dialogs' widgets: bar, slider, check box, button, text field, list. Built from what their callers show; their own draws only partly read. |
| `0x7c084`–`0x7cdc4`, `0x7cedc`–`0x7d630` | 2 084 | The tutorial's goal classes. Their rules are in the port; these are their constructors and rows. |
| `0x86094`–`0x86320`, `0x29f78`–`0x2ab34`, `0x19c48`–`0x19fa8` | 2 004 | Image loaders of the wash, the stars, the deicer, the anti-fog and anti-sand machines, all built. |
| `0x4cc68`–`0x4da14`, `0x4c154`–`0x4c3c8` | 2 360 | The shop's buttons and list. The shop is built; its list's layout is noted as not read. |
| `0x5034c`–`0x5110c` | 1 824 | The language dialog, built, and the island's water. |

### Not identified

Runs with no text of their own, or too little to tell: `0x15434`–`0x179a8` (3 184 bytes,
level helpers called from many places), `0x64d38`–`0x65f88` (2 844), `0x17c2c`–`0x1986c`
(2 436), `0x5f708`–`0x60218` (2 376), `0x73100`–`0x74278` (2 352), `0x6aee0`–`0x6b20c` (812),
`0x52f8`–`0x5684` (908), `0x1d160`–`0x1d5f8` (644), and the 139 runs under 1 000 bytes
(37 404 bytes in all). `tools/re/audit.py --list` prints every run with its text and callers.

## What this says

- About 63 KB of the unread code is behaviour the port lacks and the data supports: mostly
  things seen around the game rather than its rules: the ending, the plane's information
  dialog, the loading screen, the map's life, the opening logos, effects, a few dialogs.
- About 35 KB is not applicable on the web, about 36 KB is covered another way, about 5 KB is
  for things this build has no images for.
- About 52 KB is not identified: the small runs and the eight above. Rules could be in there.

## Worth doing next, in this order

1. **The plane's information dialog** (`0xdbfc`): it is part of earning a plane trophy.
2. **The ending** (`0x342a4` on): what finishing the game shows.
3. **The questions before leaving or restarting a level**, and the perfect scores message:
   small, and they change what a button does.
4. **In-level tips** (`GameTip`, `0x40314`) and what Coffee and Cake and In-Flight Movies show.
5. **Effects**: fireworks and the notice's particles, the combo's explosion, the bonus star,
   the fan of light, black smoke, birds and bats.
6. **The map's life**, the loading screen and the opening logos.
7. **The unidentified runs**, starting with `0x15434`–`0x179a8`, to rule rules in or out.
