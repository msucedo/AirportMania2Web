# What of the binary has not been read

An audit of the game-logic part of the binary (`0x2000`–`0x8c000`). It answers how much of that
code the port has read, what every unread function is, and what is still to be done. First made
with `tools/re/audit.py` on 2026-10-10; this account is of 2026-10-11.

## Where it stands (2026-10-11)

| | functions | bytes |
|---|---|---|
| Cited by the notes or the code | 656 | 254 178 |
| Compiler filler and container templates | 1 242 | 167 090 |
| Real, not cited | 733 | 144 052 |

Of the logic that is not filler, **63.8 %** is cited. Every one of the 733 real functions not
cited now has a line in `docs/unread.tsv` saying what it is and on what evidence:

| Category | functions | bytes | what it means |
|---|---|---|---|
| `cubierta` | 238 | 58 330 | the port does the same another way: parsers of tables it reads itself, constructors and loaders of things it builds, dialog widgets |
| `fontanería` | 403 | 51 490 | lists, strings, type names, teardown: no numbers and no text of its own |
| `no aplica` | 42 | 21 524 | saving to disk, the build's settings, the online leaderboard and achievements, links out, developer overlays, the play log sent to the studio |
| `sin datos` | 25 | 6 976 | code for things whose pictures this build does not have (commented out of its resources): the two radars, the lunar buggy, the Christmas tree, the water silhouettes, a touchable message |
| `pendiente` | 13 | 3 188 | behaviour the port lacks; see the list below |
| `vista` | 7 | 1 472 | draws something the port builds from other evidence; its own code not read |
| `muerta` | 4 | 916 | never reached: the level's bird, the perfect scores message |
| `regla` | 1 | 156 | a rule of play; read and built this day |

Counting what is read and what is set aside with a reason, **98.8 %** of the logic that is not
filler is accounted for (`tools/re/audit.py` prints the figure). The rest is the pending list.

### How the ledger was made, and how far to trust it

- `tools/re/ledger.py` gathers, for each function: who calls it (conditional branches too),
  whether a table of functions holds it, whether the code forms its address (how factories are
  registered), what of the engine it calls (drawing, loading, sound, touch, the profile, the
  awards), how many floating-point instructions and stores it has, and its text.
- 240 functions were decided by hand from that and from their neighbours, opening the ones
  that touch the state of play; the decisions are in `tools/re/ledger/decisions.py`.
- 493 were decided by rule (`by rule` in their note): no numbers and no text, or nothing but
  loading and making objects. The rule only counts floating-point numbers, so the largest of
  them (nine functions of 600 to 2 300 bytes) were opened to see that no rule in whole numbers
  hides there: they copy strings, tear lists down, compress and format numbers. The small
  ones were not opened one by one.
- `tools/re/unused.py` is the other check, and the sharper one: it lists what the game's code
  names (pictures, sounds, texts), that the data has and the port's own code never names. It
  looks at cited functions too. It is what found the sounds and screens below.
- `tools/re/audit.py --thin` lists the cited functions the notes say least about. Most are
  builders read through their arguments; the click handler (`0x10b58`), the plane's
  constructor (`0x45e4`) and the HUD's (`0x4e25c`) are the ones worth reading again in full.

## Found and built on 2026-10-11

- The player's difficulty (`profile+0x48`): it follows each level's result and scales the
  level's clock and the planes' energy drain. It was inside a cited function.
- Level start (`0x105e8`): arrivals 6 s later when a tip opens the level; the level lasts at
  least until 5 s after its last arrival.
- Rerouting (`0x10c2c`): a second touch on a place clears the plane's orders first.
- Sounds: the emergency arrival, the map's Play (which starts the level reached at once),
  the loading belt's click.

## Second pass: reading the game's functions again (2026-10-11)

`tools/re/gaps.py <start> <end>` lists the stretches of a function that nothing cites, with the
numbers they use, what they call and what they write. Reading those is the second pass.

Found so far, and built:

- the click handler (`0x10b58`): the tick or cross a touch leaves (`YesNoMessage`); a plane's
  orders are cancelled only by a second touch on nothing; touching a plane that cannot be
  picked lets go of the one picked;
- the level's update (`0x11654`): after the time is out the clock stays and the seconds on are
  counted by the real clock;
- the plane's update (`0x6af0`), state 9: under the wash it shuts its eyes, flutters them and
  shakes itself;
- the gate's draw (`0x436e4`): for a second after its colour changes it swings between the
  old and the new.

- the runway's update (`0x6db18`) and the gate's constructor (`0x430b4`): with the tutorial on,
  combos last a fifth longer and gates work a fifth faster;
- the hangar's update (`0x4747e`): its starting sound and then its loop on one channel, faded a
  second before the work ends. Every other stoppable sound of the logic (`0x8cae8`, `0x8c2cc`:
  the gas station, the luggage belt, the helicopter, the anti-fog and de-icing machines) was
  checked against the port and is played as the game plays it.

Gone through and found already covered: the plane's flight, landing, taxiing and take-off
(their sections in the notes), the HUD's update, the scheduling in the level's start, the
runway's use and combos, the gas station, the stop spots, the painting spot and the wash's
own code. For those the check was of each stretch's numbers, calls and writes against the
notes' sections, opening what did not match; not a line-by-line reading.

## Third pass: line by line (2026-10-11)

What the second pass only checked against the notes, read through. Found and built:

- the plane's update (`0x6af0`): the eyes' shift runs at 8 a second and the gear at 2 (the
  port had 4 for both); its sounds are placed across the screen by where it is; the plane
  under the pointer, when it can be picked, is a tenth larger;
- the gas station (`0x40e32`) and the luggage belt (`0x56cf2`): their sound is turned down
  over its last second (the belt's by the plane's fueling time, as the game has it);
- the helicopter (`0x4956a`): its sound comes up to half over a second;
- the awards room's table: each kind of award has its own touch area, a special trophy's by
  the `Height` the table gives it, which the port did not read.

Read through and found to match the notes: the plane's holding pattern, taxiing, mood and
balloons; the runway's use and combos; the gas station's arrival and rules. The stage scripts
(`0xcc000`–`0xe4000`) are cited only by where they start, but every one was run in the
emulator for its builders' calls (`tools/re/stage_layout.py`), which is a reading of all of it.

The six stretches left over, read afterwards. Found and built:

- the hangar (`0x46e44`, `0x476ca`): its panel comes and goes in a third of a second; the
  plane shrinks to 0.7 of its size over the last 20 px going in and stands at 0.9 inside
  (`0x74fe`); its nodes and links are as the port had them, which the notes had as assumed;
- the stop spots' constructor (`0x79194`): a VIP spot has a rope (`STOPSPOT_VIP_FRONT`) the
  port did not draw; the island's spots are sorted with the planes, their front over them;
- the gate's draw (`0x436e4`, the part the notes had as not read; run in the emulator): the
  letter is drawn on the node where the plane stands, not at the building;
- every place's scale (slot 16): a place under the pointer, with a plane picked, swells.

Read and found to match: the stop spot's and the gate's rules for joining an itinerary
(`0x7983c`, `0x43e04`), the gate's arrival (`0x43238`–`0x43510`), the plane's constructor
(`0x5684`: where it starts, its energy and height), its landing and take-off against the
notes' sections (`0x7340`–`0x8200`).

The painting spot (update, finish, paint, chooser and who touches it, sign) and the wash
(start, update, roller) were then read through as well: nothing differs from the port.

Then the last three: the chooser's draw and the wash's water, stars and splashes match the
port; the engine's rotation was found to turn as Pixi's does, which settles the ring, the
spray can and the plane's pitch. Reading which parts of each place take its swell found
that the hangar's own picture is its front half, with the remark over it (the port had it
over the back), and that the belt's remark comes after its front; both built, with the
swell kept to the parts the original scales.

## Fourth pass: the constructors set aside by rule, and what the port itself called unread (2026-10-11)

The 91 functions the ledger had as "only loads resources or makes objects" were gone through
with `tools/re/gaps.py`: 78 have no number of their own in what is not cited, and every image
they load is one the port names (`tools/re/unused.py`). The 13 with numbers were read; the
places in `src/` that said "not read" or "assumed" were then taken one by one. Found and built:

- the stage-cleared dialog (`0x78594`): the stars come one by one in a zigzag row, each with
  the till's ring and its share added to the funds, and the button comes after them;
- a dialog's widgets (`0x2bd38`): they pop or fade in over half a second; the final report's
  rows fade, its result, stars and button pop;
- a report's backdrop (`0x2c890`): eight pictures drifting up and turning, not one large one;
- the order flags (`0x6ba58`, `0x6b850`): on the place's node, coming and going in a third of a
  second, each drawn again over everything at half strength;
- the sliders (`0x2d7b4`): 120 wide, not 150; the sound level is the slider's value and the
  music's three quarters of it (the port had levels of its own);
- hints (`0x108ce`): how long one keeps quiet goes by the stage reached, 3 to 5;
- a popped balloon's burst (`0x255e4`); the tutorial question's choices (`0x7ea9c`).

Read and found to match: the buoys (`0x23338`), the tutorial report's Continue (`0x7f774`),
the airport's constructor (`0xe994`). Set aside with a reason: the message dialog `0x32170`
(only the language change and a failed saved game use it), the money sign
(`GUI.INGAMEGUI.MONEY_SIGNS.DOLLAR`, loaded at `0x4e482` and kept nowhere).

Still said to be ours in `src/`: the knob's cross-fade on a slider, the credits' line height,
how the engine keeps bordered letters apart, and the storage formats.

## Fifth pass: the data tables, name by name (2026-10-11)

Every name each table reader of the game takes (the strings of `0xa9c4`, `0x440c8`, `0x4138c`,
`0x4798c`, `0x573d4`, `0x6e678`, `0x52560`, `0x53078`, `0x1d5f8` and the tables' own loaders)
was looked for in the port, and every field the port's readers make was looked for in the rest
of it.

- `TalkHappy` and `TalkNormal` were read and never played. Following them gave `0x5f28`: a
  plane left waiting with nothing queued says so in the voice of its mood. Built, with the
  mouth it chats with (`0x13d740`) and the whistle's full nineteen frames (`0x13d7f0`).
- `ExtraPlaneNumber`: the link between a stage's licence and its levels' second schedule,
  which the notes had as inferred, is read (`0xff36`: improvement 199 plus that number) and is
  what the port has.
- `PlanesUsePantoons` is read by the port and not used: each stage's layout says the same
  thing by hand. They agree for every stage.
- Not used and not needed here: the tables' `Count`, the resources' texture hints
  (`Dithering`, `Filter`, `MipMapLevels`, `StorageFormat`, `PremulAlpha`…).

## Sixth pass: the dialogs' controls (2026-10-11)

- Button (`0x2cb50`, `0x2ca6c`): pressed while a finger is down on it, acting as the finger
  lifts, its two faces cross-fading at 8 a second. The port acted on the press and swapped
  the face when the pointer was over it. Built, except that the press must start on the button
  and that buttons do not wait for their dialog to finish opening.
- Text field (`0x2de10`): the first character typed takes the place of what the field starts
  with; a character that would make the text wider than the field less 12 is not taken; the
  caret can stand anywhere. Built on the browser's own input.
- Text in a box (`0x25218`): its last argument is the share of the width a line must fill to
  be spread out, not a size. The tips shower's words and the award notice were drawn at 0.8 of
  their size from that misreading; corrected. Lines are not spread out in the port.
- Check box (`0x2d9ec`), slider, image, label, rule, frame, backdrop and how a widget comes
  in: read in this pass or the fourth, and as the port has them.
- The buttons of the questions and reports (`0x378e4`…`0x7fac8`) are the same button with a
  label and a place, which their callers' notes give.
- Not for the port: the Game Center notice (`0x310b0`, `0x31228`), the string's own routines
  (`0x30d80`).

## Seventh pass: the notes' own doubts, the map and the main menu (2026-10-11)

The lines of the notes that said inferred, assumed or not read were gone through. Read and
built from them: service tabs act as the finger lifts; the tips shower and its tips come and
go with a fade; an award swells under the finger; the ending makes its credits after 1 s, not
10. Read and matching: which sound a plane makes at each moment; plane states 6, 7, 9 and 10;
the three runway machines' flags; the shop's sound flag.

The map: its picture is drawn at its own size (`0x63af8`), so the screen is a window on a map
2040 by 510 that scrolls both ways, and it opens where the player left it. The port had it at
half size, fitted to the screen and scrolling across only, from a guess the notes owned up
to. Rebuilt. The ribbons' titles are in `FONTS.TEEN`. The rest of the map (icons, markers,
decorations) had been read off emulator runs and stands.

The main menu: every piece the port builds is in the notes with its numbers; what is not
cited there is the three promotions, which are left out on purpose.

Still open: the vertex colours of the shop list's edge bands; that a plane taken away lets
its nodes go; what each award counts in its description and the awards room's ribbon width;
the engine's text (fonts' colour effects, bordered letters, spreading lines out).

## Eighth pass: the pieces marked built (2026-10-11)

Gone through against their notes and, where it was cheap, a fresh reading or a run:

- found and built: the gas station's barrier nodes (`0x409d6`), which the notes had as of no
  known purpose; the anti-fog machine's wobble (`0x19c70`, run in the emulator), which they
  had as left out; the award notice goes at a finger lifted anywhere (`0x31c2e`), not only on
  it;
- read again and matching: the flash of a place taking an order (`0x6af20`), the helicopter
  and its award (`0x49518`, `0x49708`), the shop list's bands (`0x4dd80`), the de-icer and the
  sand against their notes, the carrier's islands, when a plane lets its node go (`0x616a`);
- read afterwards: the coin (`0x260d4`), which matches, and the balloon (`0x21ee8`,
  `0x21fc0`), which swells under a finger and pops as it lifts, as the helicopter is tapped;
  the port popped and tapped on the press. Built;
- not read again: the stars, sun and moon, the spray can, the ending's floaters, the loading
  screen. Their notes carry addresses and formulas from the passes that built them.

Still open: what each award counts in its description and the awards room's ribbon width;
the credits' line height; the engine's text.

## Ninth pass: what was left (2026-10-11)

- The spray can (`0x77a80`, `0x77b78`) and the first loading screen match their notes.
- The moon and the three far stars are never on a 480 px screen in the original either
  (`0x29e08`, `0x29968`).
- The ending's floaters are drawn at their own size; the number each is made with only
  measures its sway (`0x35ce4`, `0x35e6c`). The port had scaled the pictures. Built.
- The awards room's ribbon is the name plus 90 wide, from y 5 (`0x1e366`). Built. The value in
  an earned award's description is the one kept with the award (`0x1ae38`).
- The tips shower's text is laid out spread to its width (`0x7a274`, mode 3). Built with the
  browser's justifying.
- A credits line's height is the font's own line height (`0x27df8`); the port uses the font's
  cached size, the other not being in the data.

What stays ours, by its nature: the fonts' colour effects and how bordered letters are kept
apart, which are the engine's rasterising of TrueType and are drawn here by the browser.

## The ledger after these passes (2026-10-12)

`docs/unread.tsv` was written again from fresh evidence: 660 functions of the logic are not
cited by address, every one set aside with a reason. Its "cubierta" lines keep the reasons
they were given (loaders, table readers, dialog controls, pieces built), but those groups are
the ones passes four to nine went through, with what each found written above.

One finding of the last pass was in the port's own drawing, not in what was unread: the
plane's body was drawn 28 px under where the original puts it (`0x85b0`), which only showed
once the touch's ellipse was the original's.

## Pending: behaviour the port lacks

In the order they would be seen. None is a rule of play except the second.

1. ~~**The scene-loading screen**~~ (`SceneLoading`, `0x70ce4`): built on 2026-10-11; see the
   notes.
2. ~~**Advanced options**~~ (`0x2220`): built on 2026-10-11, both kinds, with show tips and tap
   on bubbles; and the touch area of a plane as the original has it.
3. ~~**Colour help**~~ (`0x265ac`): built on 2026-10-11, with the three other colour tables.
4. ~~**The gate's label on hover**~~ (`0x43d2a`): built on 2026-10-11.
5. ~~**The pause screen**~~ (`0x6a210`): built on 2026-10-11; it comes when the page is hidden
   during play, the owner's choice of what stands for the device's interruption.
6. **Small looks**, gone through on 2026-10-11:
   - built: the island's shore waves (`MESHES.WATER_MESH`, `0x5021c`), the check box's
     pressed picture, the menu entries' highlight and their acting as they are let go
     (`0x25bd0` is the engine's plain button, not a bounce);
   - never drawn by the game, so nothing to build: the HUD's money sign (loaded at `0x4e482`,
     kept at `+0x24` and read nowhere) and `EFFECTS.BONUS_REMARK` (see the combo explosion);
   - read and built later that day: the level marker's own update and draw (`0x5de28`,
     `0x5def0`) and the awards room's back button (`0x4bcd0`, `0x4bcfc`).
7. ~~**The original's language dialog**~~ (`0x5073c`): never opened in this build (it is made
   and kept at `app+0x13c`, which only its own code reads), so there is nothing to build.

Not pending, for the record: `SOUNDS.REPAIRING_LOOP` is loaded and never played;
`EFFECTS.FIREWORKS.EXPLOSIONS.%d` is loaded and never drawn; the UFO (`0xbc784`) is in the
engine's part and has no caller in the logic; the continue-game question and the error for a
save that cannot be loaded belong to saving a level in play, which the port does not do.

---

The account of 2026-10-10 follows as it was written, for the runs it names.

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

1. ~~**The plane's information dialog** (`0xdbfc`)~~: built.
2. ~~**The ending** (`0x3473c`)~~: built.
3. ~~**The questions before leaving or restarting a level**~~: built. The perfect scores
   message turned out never to be shown (nothing reads where it is kept).
4. ~~**In-level tips** (`GameTip`, `0x40314`)~~: built. Coffee and Cake and In-Flight Movies
   were the service tabs, already built; the message class beside them is not used by the data.
5. ~~**Effects**~~: built: the flash of a place taking an order (`0x6aea0`), the combo's
   explosion (`0x26bd8`), the goal bar's tiers with their name, sound, stars and sparks
   (`0x11d94`), the hangar's sparks (`0x4747e`), the black smoke of a plane that needs the hangar
   (`0x75ed8`) and the fireworks of an award's notice (`0x31648`); see the notes. The level's
   bird (`0x22c2c`) turned out never to be made. A draw routine is best read by running it:
   `tools/re/draw_trace.py`.
6. ~~**The map's life**, the loading screen and the opening logos~~: built. On the map, in the
   script's order: sea glints, the island's front, birds, snow, clouds, stage 5's propellers,
   winds, the aurora, the carrier's waves, shooting stars, stars and the satellite (see "World
   map: what the script makes"); the "coming soon" sign is never made in this game. The level
   dialog (`0x64d38`) and the stage dialog (`0x63c60`) follow their read layouts. The two
   opening screens (`0x6c5c0`, `0x79d74`) and the loading screen (`0x55cc0`) are built.
7. ~~**The unidentified runs**~~: looked through (`tools/re/runinfo.py <start> <end>` lists a
   run's unread functions with their callers, callees and strings). No rule of play was hiding
   in them. What they held:
   - `0x15434`–`0x179a8`, `0x17c2c`–`0x1986c`, `0x52f8`, `0x1d160`: list and string plumbing of
     the level (finding a place in a list, tearing the level down, text lookup), the carrier's
     islands and the anti-fog machine's image loading, all already covered.
   - `0x64d38`–`0x65f88`: the map's level dialog draw (`0x64d38`, its layout is still a known
     gap under 6) and the floating texts (`0x656a8`, `0x65934`), whose wobble, stacking and fade
     are now built.
   - `0x6aee0`–`0x6b20c`: the flash of a place taking an order, now built.
   - `0x5f708`–`0x60218`: the map's entry and draw (under 6), and the tester's name
     `qatester911`, which opens every level and adds a "$" button to the improvements dialog:
     noted and deliberately not built.
   - `0x73100`–`0x74278`: `Sea`, `Sky`, `SerializableLine` loaders and `ShowAreaLevel`, a
     developer's overlay (`%d-%d`, `%3d %3d`).
