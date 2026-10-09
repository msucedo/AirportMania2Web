# Reverse-engineering notes

Target: `AM2S`, armv7 slice (sha256 `fdbb98d2…9b05`), unencrypted, no symbols.
Addresses are virtual addresses in that slice. "Confirmed" means read from the disassembly;
"inferred" means deduced from context and still to be verified.

## Coordinate system

Screen space, 480×320, origin top-left, unscaled. Confirmed by the stage builder: the lower
background is placed at (0,160) scaled ×16 (a 30×10 tile → 480×160) and the upper background
(480×126) at (0,34), leaving the top 34 px for the HUD. Runways deliberately run off the right edge.

## Stage builders

The original stage scripts (`stage_NN.as`, `map.as`) are compiled into native code. `sub_ccc8c`
holds the world map, the tutorial stage and stage 1 (Arches) merged by the disassembler.

Airport builder methods (first argument is the airport/stage object):

| Address | Creates | Constructor | Arguments |
|---|---|---|---|
| `0x1328c` | sprite | `0x83e84` | resource name, position |
| `0x13de4` | scaled/tiled sprite | `0x83f80` | resource name, position, scale |
| `0x1404c` | decoration sprite | `0x842fc` | resource name, position, float (inferred: depth) |
| `0x135f4` | unknown, 0x1d4 bytes | `0x74548` | float (82.0 in Arches), 1.0 |
| `0x141ac` | gate | `0x42ea0` | position, upgraded flag, letter; ctor gets `letter - 'A'` |
| `0x1434c` | gas station | `0x40778` | position, 1, 1 |
| `0x1440c` | runway | `0x6cef8` | position, 1, runway number, flag, 0 |
| `0x144e4` | stop spot (storage place) | `0x79178` | position, upgraded flag, 0 |
| `0x145a8` | painting stop spot | `0x67c24` | position, 0, float 42.0 |
| `0x147f8` | taxi node (0x20 bytes) | `0x45ff4` | position |
| `0x13458` | purchasable improvement | — | id, price, name/title/description ids |

Class identification is by address proximity to each class's descriptor-parsing code
(`"Gate"` used at `0x42af0`, `"GasStation"` at `0x40674`, `"StopSpot"` at `0x78b48`,
`ComboTimeTotal` at `0x6e67c`). The taxi node is identified only by its layout (position plus a
link list): inferred.

### Runway (`0x6cf14`)

- Click rectangle: (x−190, y−18) to (x+190, y+18). The position is the runway centre. Confirmed.
- Node position: (x+144, y) with heading 180° when the flag is 0; (x−144, y) with heading 0° when
  the flag is 1. Confirmed for the arithmetic; that this node is where planes touch down / line up
  is inferred.
- Landing approach (`0x7fb0`–`0x8054`, confirmed): with heading 0 the plane starts at node.x + 750
  moving left at 250 px/s; otherwise at node.x − 750 moving right. It descends from altitude 600
  at 250 units/s (2.4 s). Take-off (`0x6110`) sets an acceleration of 200 px/s² (field `+0x2e8`; `+0x2e0` is the velocity), rightwards when the flag is 1.

### Stage 1, Arches (`0xce744`–`0xcec82`)

All confirmed from immediates unless noted. See `src/game/stages/arches.ts`.

- Lower background `STAGES.ARCHES.BACKGROUND_DOWN` at (0,160), scale (16,16).
- Upper background `STAGES.ARCHES.BACKGROUND_TOP` at (0,34). It is an 8-bit greyscale image;
  how the renderer uses it (mask, tint) is not yet known.
- Gates A (40,122), B (120,122), C (200,122). A and B always exist; C needs improvement `0x16`
  or `0x20`. Upgraded art when `0x1e` (A), `0x1f` (B), `0x20` (C) is owned.
- Gas station (280,120), only when the level number is ≥ 3.
- Five taxi nodes at y=220, x = 80, 110, 140, 170, 200.
- Runway 1 at (450,225) and runway 2 at (495,270), both with flag 1.
- Stop spot at (180,300), upgraded with improvement `0x0a`. A second one at (60,300) when
  improvement `0x01` is owned; replaced by the painting stop spot when `0x72` is owned.
- Decoration `STAGES.ARCHES.ARCH` at (403,50), extra float 600.0.
- Level-specific branches follow for levels 3 and 6 (not yet read).

Improvements registered for the stage (id, price): `0x01` 10000, `0x72` 60000, `0x0a` 20000,
`0x16` 20000 (`IMPROVEMENTS.GATE_0`, confirmed), `0x1e` 25000, `0x1f` 30000, `0x20` 35000
(confirmed), `0xcb` 85000. The meaning of the others follows the string order in the function
(extra storage place, painting stop spot, VIP storage place, improved gates A/B, plane 4 licence):
inferred.

## Click handling (`0x10b58`, called from the level update `0x11654`)

Read from pseudocode and the callee disassembly.

- Pressing on a plane: the plane under the pointer is selected if `Plane::isSelectable` (`0x5e4c`)
  allows it (plays `SOUNDS.SELECT_PLANE`); otherwise `SOUNDS.FORBIDDEN_CLICK`.
- With a plane selected, pressing on a place hit-tests the place list (`0x6b3c8`) and calls
  `Plane::addOrder` (`0x5ad8`). Success plays `SOUNDS.PLACE_CLICK`; failure `SOUNDS.FORBIDDEN_CLICK`.
- In rerouting mode the plane's queue is cleared first (`0x609c`, `SOUNDS.REROUTING`).
- Pressing on nothing with a plane selected cancels its queue (`0x6028`, `SOUNDS.QUEUE_CANCEL`).
- The selected plane is stored at controller `+0x118`.

## Plane (`0x45e4`–`0xa9c4`)

Fields (confirmed from accesses): state `+0x32c`; order queue vector `+0x334`/`+0x338` of
8-byte entries (order number, place); current target place `+0x340`; `+0x344` second place
reference; pending need code `+0x264`; energy fraction `+0x318` (0..1); position `+0x30c`/`+0x310`;
descriptor `+0x8`.

### `addOrder` (`0x5ad8`) — confirmed

1. Fails if the queue already holds 8 orders.
2. If the queue is empty and the state is 0 or 2, the place must accept the plane as a first
   destination (place virtual slot 15); otherwise the plane shows a rejection (`0x5bd4`) and fails.
3. Fails if the place is already queued, or is the plane's current (`+0x340`) or `+0x344` place.
4. The place must accept the plane (place virtual slot 11).
5. The place's order counter (`+0x54`) is incremented and (counter, place) is appended.

### States

`isSelectable` is false for states 1, 5, 11 and 12 (mask `0x1822`), true otherwise.

| State | Meaning | Set by | Confidence |
|---|---|---|---|
| 0 | flying, including the landing approach (so the plane stays selectable while landing) | constructor `0x5684` | confirmed |
| 1 | leaving the airport: gave up (`0x6a24`, energy below 0 at a turn while flying) or 2 s after lift-off (`0x7d60`) | plane update `0x6af0` | confirmed |
| 2 | waiting for orders | many (`0x630c`, `0x64ac`, `0x635c`, …) | confirmed |
| 3 | taxiing to the next queued place | `0x6594`, `0x66c8` | confirmed |
| 4 | loading at a gate (second arrival, normally on the same gate) | `0x62cc`, called by gate `0x43238` | confirmed |
| 5 | unloading at a gate (first visit); queue cleared | `0x6378`, called by gate `0x43238` | confirmed |
| 6 | in the hangar | `0x6698`, called by hangar | inferred |
| 7, 9 | gas station phases | `0x6748` | inferred |
| 8 | unknown | `0x6354` | unknown |
| 10 | unknown, set from `0x56b78` | `0x6820` | unknown |
| 11 | taking off | `0x6110`, called by runway `0x6d584` | confirmed |
| 12 | in the air after the take-off run | `0x7cc2` | confirmed |
| 13 | touched down; the runway scores it | `0x6af0`, read by runway `0x6d584` | confirmed |

Need codes at `+0x264`: after unloading, 2, 3 or 5 when a service is still pending and 6 when
none is (load at the gate); 7 after loading (take off). The flags `+0x26a`, `+0x26b`, `+0x26d`
mean "service done or not needed"; `+0x268` is set once the plane has landed.
`+0x269` is set when unloading finishes (`0x64ac`) and `+0x26e` when loading finishes (`0x630c`).

### Punctuality — confirmed

Judged when unloading starts (`0x6378`) and again at take-off (`0x6110`) from the energy fraction:
below 0.3 is LATE, below 0.6 is ON_TIME, otherwise EARLY. The text floats at (x, y−50). Each
outcome increments a level counter (unloading: `+0x148`/`+0x144`/`+0x140`; take-off:
`+0x154`/`+0x150`/`+0x14c`).

## Plane descriptor layout (parser `0xa9c4`) — confirmed

| Offset | Attribute | Offset | Attribute |
|---|---|---|---|
| `+0xa8` | Passengers | `+0xc4` | LeavingPoints |
| `+0xac` | GatePoints | `+0xc8` | LoadingTime |
| `+0xb0` | HangarPoints | `+0xcc` | ServicingTime |
| `+0xb4` | GasStationPoints | `+0xd0` | LuggageLoadingTime |
| `+0xb8` | LuggagePoints | `+0xd4` | FuelingTime |
| `+0xbc` | WashingPoints | `+0xd8` | MaleEnergyFallTime |
| `+0xc0` | RunwayPoints | `+0xdc` | FemaleEnergyFallTime (inferred, next slot) |

## Runway use completed (`0x6d584`) — confirmed

Handles both a finished landing (plane state 13) and a take-off (any other state).

- `factor = clamp(plane.energy, 0, 1)` (`0x5a74`; a negative energy uses a literal not yet read).
- `base = floor(factor * RunwayPoints / 5) * 5`.
- The runway keeps a consecutive counter and a combo timer per kind: landings `+0xb8` / `+0x98`,
  take-offs `+0xbc` / `+0x90`. If the timer is still positive the counter is incremented and, when
  the previous count was at least 1, `points = base * min(counter, 4)` with the `IN_GAME.BONUS_X`
  text and `SOUNDS.BONUS_X%1d`. If the take-off timer has expired the counter restarts at 1.
- Take-off then calls `Plane::takeOff` (`0x6110`, state 11).
- Points are shown on the plane (`0x5d2c`) and added to the level score (`0xfffc`).
- Where the timers are armed (presumably with `ComboTimeTotal`) is not yet read.

## Gate: plane arrives (`0x43238`) — confirmed

- The gate stores the plane (`+0x40`) and compares the plane colour (`plane+0x348`) with the
  colour of the previous plane it served (`+0xc0`).
  - Colour 8 is special: the stored colour is reset to 0 and the counter is left alone.
  - Different colour: counter (`+0xc4`) = 1 and the colour is remembered.
  - Same colour: counter + 1, capped at 4 (skipped while the flag at `+0xd0` is set).
- `points = floor(clamp(energy) * GatePoints * counter / 5) * 5`.
- If the plane has not unloaded yet (`plane+0x269` clear) it starts unloading (state 5), otherwise
  it starts loading (state 4).
- With counter ≥ 2 the `IN_GAME.BONUS_X` text and `SOUNDS.BONUS_X%1d` are shown.
- Points are added to the level score; then `0x9b18(plane, 0.25)` is called (meaning not yet read).

## Plane spawn, energy and speeds — confirmed

- Constructor `0x5684`: energy starts at 1.3, state 0, altitude 600. Entering from the right the
  ground position is (540, 705) with scale 1.0; from the left (−60, 680) with scale 0.8. The plane
  is drawn at y − altitude. Horizontal flight speed 80 px/s (global `0x1772d8`).
- The four `Need*` level attributes are stored at `+0x26a`…`+0x26d`; an emergency flag at `+0x228`.
- `addEnergy` (`0x9b18`): `energy = min(1.2, energy + amount)`, ignored in state 1. Called with
  0.25 on every gate arrival and on landing.
- Drain (end of `0x6af0`): only in states 0 and 2, `energy -= dt / EnergyFallTime` (male or female
  value by sex), doubled for emergency planes, optionally scaled by the current place
  (`plane+0x320`, field `+0x6c`), floored at −0.3.
- Gate service (`0x435c8`): progress grows by gate `Speed` × dt and completes above `LoadingTime`,
  for unloading and loading alike.
- Other globals: 200 take-off acceleration (`0x1772dc`), 250 landing speed (`0x1772e0`).

## Giving up, taxiing and take-off — confirmed

- `Plane::giveUp` (`0x6a24`): state 1, lost-plane counter (`level+0x138`) + 1, and the score is
  charged `LeavingPoints` (`addScore(-LeavingPoints)`). This is the only reader of that field, so
  it is a penalty, not a reward. The level score (`+0x12c`) is not clamped at zero.
- Taxi (`0x74bc`–`0x7950`): the plane heads for its next node (`+0x240`) on the way to a target
  node (`+0x248`). Acceleration 200 px/s² (`0x1772b8`) along the direction to the node, speed
  capped at 200 px/s (`0x1772bc`), and it brakes once the remaining path distance (`+0x234`) is
  within v²/(2a). The next node comes from a router over the taxi node graph (`0x46200`); nodes
  carry an occupancy byte (`+0xc`).
- Arrival at the target: the place's virtual slot 15 decides whether the plane may enter, then
  slot 12 receives it (for a gate, `0x43238`). The place moves from `+0x340` to `+0x344`.
- Touch-down (`0x73c6`): state 13, and an acceleration of 150 px/s² opposing the 250 px/s roll.
- Take-off: when the run covers 100 px (½·a·t² > 100, `0x7c50`) the plane goes to state 12 with a
  climb rate of 140; 2 s later (`0x7d34`) it goes to state 1 and the served counter
  (`level+0x13c`) is incremented.

## Places: virtual interface — confirmed

Vtables: gate `0x17a878`, runway `0x17b4d8`. Kind (slot 8): runway 0, gate 1.

| Slot | Meaning | Gate | Runway |
|---|---|---|---|
| 6 | update | `0x435c8` | `0x6db18` |
| 9 | release | `0x435c0` (state 0) | `0x6db0c` (state 0) |
| 11 | may join the plane's itinerary | `0x43e04` | `0x6e328` |
| 12 | plane arrived | `0x43238` | `0x6d584` |
| 13 | reserve for a plane | `0x435a8` | `0x6d9e4` |
| 14 | busy | `0x43510` | `0x6da24` |
| 15 | may the plane enter now | `0x43530` | `0x6da34` |

`0x6b530(place, plane, kind)` is true when the plane's target (`+0x340`), current place
(`+0x344`) or any queued place is of that kind.

- Gate slot 11: refused if the itinerary already has a gate. Not yet unloaded: needs the plane
  landed or a runway in the itinerary. Unloaded: refused once loaded; each pending service must
  already be in the itinerary (kinds 4, 5, 7).
- Runway slot 11: refused if the itinerary already has a runway. Not landed: accepted. Landed:
  must have unloaded, and either have loaded or have a gate in the itinerary.
- Gate slot 13: stores the plane, state 1, and sets `+0xd0` when it is the plane the gate already
  held (that visit does not advance the colour counter). Runway slot 13: state 4 for a plane in
  state 0 (landing), otherwise 1.
- Gate slot 14: free in state 0, and in state 4 (loaded) for its own plane. Runway slot 14: busy
  whenever its state is not 0.
- Gate slot 15: needs the plane landed; unloaded planes need every service flag set and must not
  have loaded. Runway slot 15: blocked by `+0xd4`, `+0xcc`, `+0xd0` (ice, sand, obstacle; not
  used in level 1); a landed plane needs to have unloaded (the rest of the check is not read).
- `addOrder` calls slot 15 only when the queue is empty in state 0 or 2. The runway entry stays
  in the queue until touch-down (`0x73b0`), so orders can be added during the approach.
- Waiting with a queue (`0x7952`): the front place's slot 15 is re-checked; failure clears the
  queue. Starting the move (`0x6594`) calls slot 13, and if the plane is already on the target
  node it calls slot 12 at once.
- Unloading finished (`0x64ac`) with need 6: the plane releases its gate (slot 9), queues it again
  and starts "moving", which arrives immediately and begins loading, with a second gate award.

## Runway update (`0x6db18`) — confirmed

- States at `+0x84`: 0 free, 4 landing reserved, 3 landed plane waiting, 1 take-off reserved,
  2 taking off. State 4 becomes 3 once its plane is in state 2, arming the landing combo timer.
  State 3 is released (slot 9) when that plane leaves state 2. State 2 is released on the next
  update, arming the take-off combo timer.
- Combo timers: take-offs at `+0x8c` (flag) / `+0x90` (value), landings at `+0x94` / `+0x98`.
  Helpers `0x6e420` and `0x6e484`: while the flag is set the value grows by 15 × step up to 1;
  otherwise it falls by 0.6 × step (take-offs) or 0.4 × step (landings), floored at 0. The update
  calls them with step = dt / `ComboTimeTotal`, clears the flag when the value reaches 1, and
  resets the consecutive counter when the value is 0 (an award is raised for 4 or more).
- While the runway is reserved, the other kind's timer gets an extra call with step = 6 × dt.
- `Runway::planeDone` continues a combo when the timer value is above 0.

## Taxi graph — confirmed

- Node (`0x45ff4`, 0x20 bytes): position `+4`/`+8`, occupied `+0xc`, terminal flag `+0xd`,
  neighbour list `+0x10`, router scratch `+0x18` (previous) and `+0x1c` (distance).
- Link (`0x45d58`): refused when a third node lies within 8 px of the segment between 2 % and
  98 % of its length, or when the segment would cross an existing link (tolerance 0.1).
- Auto-link pass (`0x45bd4`, run once by the level at `0x101b4`): every pair of non-terminal
  nodes, sorted by √(dx² + (2·dy)²), is offered to the link function.
- Router (`0x46230`): Dijkstra with a binary heap, weights are Euclidean distances. Terminal nodes
  are only accepted as the destination; occupied nodes are skipped unless a flag is passed.
- Gate constructor (`0x430e6`): three non-terminal friend nodes at gate position + the
  descriptor's `FriendNodes`; links gate–friend ×3 and friend 0–1, 1–2. The gate's own node is
  terminal (base constructor `0x6ad88`).
- Runway constructor (`0x6d0d2`): its own terminal node, a second terminal node at the opposite
  end (±144), linked together; seven non-terminal nodes around each end, each linked to that end,
  at x offsets ±(86, 131, 176, 189, 202, 157, 112) and y offsets ±(−14, −14, −14, 0, 14, 14, 14)
  (tables `0x13d974`, `0x13d990`, `0x13d9ac`); two more non-terminal nodes at (−13, −14) and
  (13, 14).
- `0x45fd8`, `0x46430`, `0x466dc` are list save/load helpers, not graph construction.

## Colours and sounds

- Colour table: the gate and plane renderers read RGBA floats from `level + 0x1e0 + colour * 16`
  (and a second set at `+0x270`). `0x12ddc` copies 0x120 bytes there from
  `level + 0x300 + palette * 0x120`, with the palette index taken from the profile
  (`0x827a8()+0x50`). Where that source table is filled has not been found: `0xf37c` and `0x12f90`
  are not it. The only constant RGBA float data found is a long run of whites around `0x14c190`–`0x14c380`
  (defaults, not a palette). The web version keeps placeholder tints.
- Sounds (confirmed ids): `SOUNDS.SELECT_PLANE`, `SOUNDS.PLACE_CLICK`, `SOUNDS.FORBIDDEN_CLICK`,
  `SOUNDS.QUEUE_CANCEL`, `SOUNDS.REROUTING` in the click handler; `SOUNDS.BONUS_X%1d` in the gate
  and runway; the plane's own sounds come from its descriptor's `Sounds` element. Which descriptor
  slot plays at each moment is matched by name in the web version, not read from the binary.
- Music: `<area music>.INTRO` then `.LOOP`; the final report uses `MUSICS.FINAL_REPORT.<tier>`.

## In-game HUD (`InGameGUI`)

- `0x4e25c` loads `GUI.INGAMEGUI.BACK`, `RED_NUMBERS`, `BLACK_NUMBERS`, `YELLOW_DISC`,
  `BLUE_ORANGE_DISC`, `NO_MORE_TIME`, `BAR_SEPARATOR`, `PROGRESS_BAR_EFFECT`, the money sign and
  the fonts `FONTS.ULTRA` and `FONTS.WHITE`. `0x4eba4` is its draw; `0x514cc` builds the goal
  panel (`SCORE_GOAL_BACK`, `LEVEL_NUMBER`, `SCORE.BEST_SCORE`); `0x87994` the menu button.
- Confirmed from the draw: the goal progress bar is the rectangle x 194..313, y 4..15
  (`0x4f476`), and a pulsing effect driven by a sine.
- Measured on `ingamegui.png` (426×35), not read from code: the score window has eight cells
  11 px apart starting at x = 82, y 6..15; the progress slot interior is x 196..313.
- Digit strips are 13×244 reels: "-" then 0–9 then 0 again, one glyph every 20 px.
- Not read: when red or black digits are used, the fill colours, where the separators sit, what
  the radar disc and the notched right-hand section show, and the reel animation. The web HUD
  approximates these.

## Plane drawing

- `Plane::setOrientation` (`0x5c8c`, confirmed): perspective (`+0x324`) is 0 for headings within
  25° of 0 or 180, 1 between 25° and 155°, 2 between 205° and 335°; the sprite is mirrored
  between 90° and 270°. The art faces left, so 0° is left, 90° towards the viewer (front view),
  180° right and 270° away (back view, eyes hidden). Called on arrival with the place's heading
  (`place+0x34`; gates use the descriptor's `PlaneOrientation`).
- Resources loaded by `0x45e4`: body layers per perspective, eyes, `PLANE.MOUTH.%d`, eyebrows and
  eyelashes (with female and remark variants), propellers, `INDICATORS.ENERGY.%d` (8 frames),
  thought bubbles `INDICATORS.THOUGHT_A`–`D` with `INDICATORS.ICONS.%d`, and the globe.
- The draw (`0x89e0`) indexes every part array by `+0x324`. The energy bar offset is the
  descriptor value times a 0..1 plane factor (`+0x29c`).
- Not read: layer order, which energy frame is shown for which energy, mouth and eyebrow
  selection, blinking, and the thought bubble's layout (its icon is the need code). The web
  version assumes these.

## Gate, runway and order flag drawing

- Gate resources (`0x42afc`): the letter comes from the descriptor's `LetterSurfaceResource`
  with the gate index (`%s.%d`), plus `INDICATORS.UNLOADING_ICON`/`_BAR`, `LOADING_ICON`/`_BAR`,
  `INDICATORS.X%d`, `GATES.ON_OVER_LABEL` (+ `_COLOR` and `GATES.LETTERS.LABEL.%d`) and the
  descriptor's four-frame arrow animations. The letter sprite is authored to sit at the gate
  centre (checked by composing the images).
- Runway resources (`0x6cbf0`): `RUNWAY.REMARK`, `RUNWAY.NUMBER_%d`, the combo and "using"
  arrows and `INDICATORS.ARROWS.X%d`.
- Order flags (`0x6b720`): `INDICATORS.FLAGS.COLOR` plus `INDICATORS.FLAGS.NUMBERS.%d`; `0x6ba58`
  places one when an order is added (called from `addOrder`).
- Not read: the gate draw (`0x436e4`) and runway draw (`0x6dd44`), so the bar fill, arrow timing,
  runway number position, flag offsets, hover label and combo arrows are assumed or
  missing in the web version.

## Texts and fonts

- Strings live in `data/languages/<language>.xml` as nested `NameSpace` elements; ids are the
  dotted path (`IN_GAME.EARLY`, `SCORE.GOAL_SCORE`, `FINAL_REPORT_DIALOG.PLANES_SERVED`).
  `&br;` is a line break and `%d` / `%s` are filled printf-style.
- Cached fonts (from `resources.xml`): `FONTS.SCORE` is Kenyan Coffee Bold 14 with
  `MoneyEffect`; `FONTS.MAIN` is Brady Bunch 14 with `GoldOrangeEffect`; `FONTS.WHITE` is Teen
  Bold 11 with `WhiteSilverEffect`. The effects are gradient renderings whose colours have not
  been read; the web version uses flat fills with an outline.
- Floating texts: points use `FONTS.SCORE` (`0x5d2c`), negative points `FONTS.SCORE_NEGATIVE`
  (`0x5de0`), punctuality and bonus texts `FONTS.MAIN`, 50 px above the plane (`0x6110`).
- The final report dialog layout is not reconstructed; the web summary uses the original
  strings, fonts and star sprites in its own layout.

## Stage backdrop

- `0x135f4(level, 82.0)` creates a `Sky` object (class name string `Sky`, constructor `0x74558`):
  it sets up eight lights at fixed x positions (26, 93, 195, 240, 362, 523, 699, 764) and
  `0x74358` draws colour bands across the 480 px width using components such as (0.6, 0.9, 1.0).
  The exact band layout has not been read; the web version draws a gradient in those blues.
- `0xcda08(82, 5)` spawns the clouds (`AMBIENT.CLOUD_1`–`3`). Not implemented yet.
- `STAGES.ARCHES.BACKGROUND_TOP` is created as a plain `StaticImage` (`0x83e84`) at (0, 34). The
  file is an 8-bit grey image; the web version treats it as a silhouette (brightness = opacity)
  drawn in the colour of the ground tile's top row, which joins the ground without a seam. That
  interpretation fits the art but is not confirmed in the renderer.
- `STAGES.ARCHES.ARCH` is a `StaticZImage` (`0x842fc`) with a depth value of 600.

## Needs, schedule flags and the gas station — confirmed

- Schedule parser (`0x53078`): each arrival carries a flag byte. Bit 0 sex (set for one of
  MALE/FEMALE), bit 1 side, and a bit is set when the need is **false**: `NeedService` bit 2,
  `NeedGas` bit 3, `NeedWash` bit 4, `NeedLuggage` bit 5. The level (`0x1094c`) passes bits 2–5
  to the plane constructor, where they become `+0x26a` (service), `+0x26b` (gas), `+0x26c`
  (wash) and `+0x26d` (luggage): "done or not needed".
- Need codes (`+0x264`) double as indices of `INDICATORS.ICONS.%d`: 0 land, 1 unload, 2 service,
  3 gas, 4 wash, 5 luggage, 6 load, 7 take off (icon meanings checked on the sprites).
  After unloading (`0x64ac`): 2 if service is pending, else 3 if gas is pending, else 5 if
  luggage is pending, else 6. Only code 6 triggers the automatic re-entry of the gate.
- Gas station: vtable `0x17a808`, kind 4.
  - Slot 11 (`0x410d0`): refused when gas is done or not needed, when the plane has not unloaded,
    or when the itinerary already has a gas station; if service is pending the itinerary must
    include a kind-5 place (hangar).
  - Slot 15 (`0x40d4c`): landed, unloaded, service done, and gas still pending.
  - Slot 12 (`0x40cbc`): starts fueling (plane state 7, station state 2) and adds 0.25 energy.
  - Slot 6 (`0x40dd4`): progress grows by station `Speed` × dt; above `FuelingTime` the plane
    gets `Plane::fuelingFinished` (`0x6798`: gas done, state 2, need 6 or 5) and
    `floor(clamp(energy) * GasStationPoints / 5) * 5` points; the station then waits in state 3
    until the plane leaves state 2.
  - Slots 13/14/9: reserve (state 1), busy (state ≠ 0), release (state 0).
  - Constructor (`0x40952`): two pass-through nodes at (+30, +9) and (−15, +9) linked to the
    station node and to each other, plus two linked terminal nodes at (+30, −15) and (−50, −15)
    whose purpose is not known (not modelled). The reference point is taken to be the station
    node; that is an assumption.
- Stop spot: vtable `0x17b928` (slots 11 `0x7983c`, 12 `0x79788`, 13 `0x797a0`, 14 `0x797b4`,
  15 `0x797a8`, 6 `0x797c8`, 9 `0x797c0`). Not read yet.

## Still unknown

- Plane update (`0x6af0`): transitions for landing and states 8, 10, 12, 13; taxi speed.
- Taxi node occupancy (set as planes claim nodes) and the stop-spot nodes: not modelled.
- The exact loop bounds of the two runway ring loops (seven nodes each is assumed from the tables).
- Where exactly a landing plane stops and when the runway is freed; the simulation stops it at the runway node.
- Whether a busy front place makes the plane wait (assumed) and the queue reordering at `0x797e`.
- How the level ends relative to `TotalTime`; `PATIENCE_VALUES.*` / `SPEED_VALUES.*`.
- Plane and gate tint colours: the source of the colour table (see above).
- Whether the renderer really uses `.cgf` grey images as opacity masks; clouds and sky lights.
