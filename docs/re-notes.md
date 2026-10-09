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
inferred. Registered order: `0x01`, `0x0a`, `0x72`, `0x16`, `0x1e`, `0x1f`, `0xcb`, `0x20`.
`0x13458` also stores a number per improvement (2 for `0x01`, 4 for `0x16`, 3 for `0x1e`, 1000
for the rest) whose use has not been read.

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

- Colour table (confirmed): the renderers read RGBA floats from `airport + 0x1e0 + colour * 16`
  (main) and `+0x270` (shade), where `airport` is `*(0x2ef4() + 0xfc)`. `0x12ddc` copies 0x120
  bytes there from `airport + 0x300 + palette * 0x120`, the palette index coming from the profile
  (`0x827a8()+0x50`). `0xcc6ac` fills the source tables with immediates. Palette 0, main/shade:
  0 `c8c8c8` (no colour), 1 blue `70a9ff`/`5d9eff`, 2 orange `ffb05a`/`ff7b00`, 3 green
  `bde26c`/`8db92d`, 4 cyan `8ad8c1`/`60cdd7`, 5 pink `f38fe0`/`f389bb`, 6 yellow
  `e3c53a`/`f9ff31`, 7 violet `c789f3`/`9764f3`, 8 `646464` (president). Palettes 1 and 2 are
  flat, high-contrast sets for the colour help option and are not used by the web version.
- Colour names map to indices in the order of the strings at `0x16bfb0`: BLUE, ORANGE, GREEN,
  CYAN, PINK, YELLOW, VIOLET (1–7).
- Two-colour draw (`0x84440`): the surface is drawn as one quad with per-vertex colours, main at
  one corner, shade at the opposite one and their average at the other two. Which corner is which
  is inferred from the rectangle fields (main top-left, shade bottom-right).
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
- Update (`0x4e89c`) and draw (`0x4eba4`), confirmed:
  - Score reels: eight structures of (position, target, speed) at `+0x390`, reel 0 the units.
    Reel i is drawn at x `158 − 11 i`, y 2, showing 12×18 px of its strip from row `position`;
    the black strip for a score of 0 or more, the red one below. A digit d is at row
    `20 (d + 1)`; row 0 is the dash a reel starts on. A new score sets the target of each of its
    digits, and a negative one puts the dash on the leftmost reel. Reels move 200 px/s, upwards
    when the score rose, wrapping over 200 px, and stop on reaching the target.
  - Goal bar: y 4–15 from x 194, 119 px long. With t tiers reached, the bar stands at
    `194 + 119 (f^0.6 (G[t] − G[t−1]) + G[t−1]) / G[last]`, f being the progress inside the
    current tier (`level+0x1ac`); 313 when every tier is reached, when the whole bar pulses with
    `sin(10 t)`. Segments up to there are drawn per tier and the rest at half strength, with
    colours from a table filled at run time (`0x181314`, also used for the goal plates), which has
    not been found. `PROGRESS_BAR_EFFECT` slides at the bar's end.
  - `GUI.INGAMEGUI.BACK` is drawn over reels and bar, then `BAR_SEPARATOR` at
    `floor(194 + 119 G[i] / G[last] − width / 2)` for every goal but the last, then the menu
    button (`0x87994`).
  - Clock: `r = (TotalTime − time) / TotalTime` read as three base-9 digits, `floor(9 r)`,
    `floor(81 r) mod 9` and `floor(729 r) mod 9` (all 9 at the start). The constructor
    (`0x4e4f0`) builds nine points every π/8 round the lower half of a circle centred on
    (34.5, 0), from the left end, for three rings: radii 22.5–29 and 7–15.5 textured with
    `BLUE_ORANGE_DISC` and 15–23 with `YELLOW_DISC`. Each ring is drawn as a strip of
    `2 + 2 d` points for its digit d (18 at most): the outer ring takes the first digit, the
    yellow one the second and the inner one the third. The segment being lost fades.
  - `NO_MORE_TIME` blinks once the time is up.
- Web version: bar colours are ours; a reel beyond the score's digits goes back to the dash; the
  fading of the clock's last segment and `NO_MORE_TIME` are not drawn; the numeric clock the web
  version had, which the original does not, is gone.

## Plane drawing

- `Plane::setOrientation` (`0x5c8c`, confirmed): perspective (`+0x324`) is 0 for headings within
  25° of 0 or 180, 1 between 25° and 155°, 2 between 205° and 335°; the sprite is mirrored
  between 90° and 270°. The art faces left, so 0° is left, 90° towards the viewer (front view),
  180° right and 270° away (back view, eyes hidden). Called on arrival with the place's heading
  (`place+0x34`; gates use the descriptor's `PlaneOrientation`).
- Resources loaded by `0x45e4`: body layers per perspective, eyes, `PLANE.MOUTH.%d`, eyebrows and
  eyelashes (with female and remark variants), propellers, `INDICATORS.ENERGY.%d` (8 frames),
  thought bubbles `INDICATORS.THOUGHT_A`–`D` with `INDICATORS.ICONS.%d`, and the globe.
- Draw order (`0x89e0`, confirmed): shadow (alpha `1 - altitude / 50`, not drawn above 50);
  when selected, the remark outlines of body, eyebrows, eyelashes and gear or pontoons, tinted
  with the plane's colour pulsing to white by `clamp(sin(12 t) + 0.5)`; rear propellers; landing
  gear; in the back view the eyelashes and, with `DrawEyeBrowsFirstWhenTurnedBack`, the eyebrows;
  colour layer (two-colour draw); line art; dirt while a wash is pending; eyebrows; eyelashes
  (females); mouth; eyes; front propellers (`0x963c`); pontoons; passenger icon; thought bubble
  (`0x9740`); energy bar.
- Energy bar: `v = min(7.99, energy * 8)`, nothing at or below 0. With `f = floor(v)`: if the
  fraction is 0.5 or more frame `f` is drawn; otherwise frame `f - 1` and, over it, frame `f`
  with alpha following a triangle wave of `fraction * 14`. It moves 16 px aside when a passenger
  icon is shown.
- Mood (`0x869a`): energy below 0.3 → 3, below 0.5 → 2, below 0.7 → 1, else 0. Mouths 0, 1, 2
  and 4; eyebrow tilt 0°, 0°, 10° and 25°, approached at 50°/s (`0x1772cc`), the right eyebrow
  mirrored.
- Mouth animations override the mood mouth (`plane+0x40`, frames per second and mouth indices):
  talking `0x13d798` (16 fps: 9 10 11 7 8 7 10 9 10 11 7 8 7 10), played with the plane's voice
  (`0x5bd4`, `0x5f28`, `0x6a24`); cheering `0x13d848` (14 fps: 5 6 6 6 6 6 6 6 6 5) from
  `Plane::addEnergy` (`0x9b18`), which also raises the eyebrows, turns the eyes for a second and
  schedules a blink within 0.5 s; whistling `0x13d7f0` (6 fps, mouths 12–17) with `Whistle1/2`
  from `0x5fd0`, for a plane above 0.5 energy in a state not identified (not in the web version).
- Eyebrow raise (`+0x200`/`+0x204`): the value climbs at 3/s to 1 and falls back; the eyebrows
  move up by `6 * v^0.7`, at most 3 px, and the tilt is scaled by `min(0.5, v^0.7)` meanwhile.
- Eyes: shut while the blink timer is at or under 0.1 s; the timer restarts at a random 5–10 s
  (`0x1772c4`, `0x1772c0`). They shift by the descriptor's `Movement` times a 0..1 value
  (`+0x29c`, 4/s) that is on while the plane waits with no orders or just spoke or cheered.
- Propellers: two frames, `(floor(t * 15) + number) % 2`. Landing gear: three frames advanced by
  `speed * dt * 0.2` on the ground; drawn squashed by `g * (2 - g)` while folding; folded on
  entering state 12 unless `AlwaysDown`. Pontoons replace the gear when `plane+0x24c` is set.
- Energy drain (`0x8906`): the rate is doubled for planes with a special passenger and
  multiplied by the place's factor (`place+0x6c`) and the profile's difficulty (`+0x48`).
- Balloons (`0x9740`), drawn before the energy bar. Each has a 0..1 value sliding at 4/s and is
  drawn above 0.25.
  - Speech balloon `INDICATORS.GLOBE` with `INDICATORS.ICONS.<n>` (`+0x270`): on while the plane
    waits (state 2) with no orders, showing its need, or while it speaks (`0x5bd4` sets a timer and
    an icon). With the descriptor's `BubblePosition` (bx, by) and the corner `c` (`+0x260`):
    `x = bx (+5 in perspective 0) (−10 for corners 0 and 2)`, negated and mirrored for corners 0
    and 2; `y = −5 − by` above (corners 0, 1) or `by` below and flipped (2, 3), less
    `28 − DespY`. Alpha `(v − 0.25) / 0.75`. `INDICATORS.GLOBE_NAG` flashes over it while the
    speech timer runs from 1.8 to 1.3.
  - Thought cloud `INDICATORS.THOUGHT_A`–`D`: on while the plane is flying or waiting with orders
    queued. The cloud is 50 px aside (left for corners 0 and 2) and 80 px above or 15 below; the
    trail D, C, B sits at (−19, 18), (−13, 19), (−7, 15) from it, mirrored the same way; puff i
    of 4 has alpha `min(1, 5v − i)`; an image owned by the next place (`place+8`) is drawn in
    the cloud with alpha `4v − 3`.
  - The corner comes from the place the plane is at (`place+0x58`, `0x75f0`), given by the stage
    scripts: 1 for gates, gas station and hangar, 0 for stop spots, 0 for Arches' runways and 1
    for the island's (the last inferred from its helper); a new plane has 3.
- Web version: gear fold rate (4/s) and selection fade are assumed; dirt, the whistle and the
  nag flash are not drawn; the thought cloud shows the matching need icon in place of the
  place's image, which has not been identified.

## Special passengers and speech — confirmed

- `plane+0x228`: 0 none, 1 president, 2 pregnant, 3 transplant organ, from the level file's
  `Passengers`. The loader (`0x4cb8`) takes the icon `PRESIDENT`, `PREGNANT` or `ORGANBAG` and
  gives the president's plane colour 8.
- While a passenger is aboard the energy falls at twice the rate (`0x8920`).
- When the plane has landed and goes to waiting (`0x8378`), a pregnant passenger or an organ is
  delivered: an award counter is raised (`0x9db0`, codes 0x15 and 0x16) and the field is cleared,
  so the hurry ends there. The president stays; leaving without being furious raises counter
  0x17 at take-off (`0x7cfc`).
- The icon is drawn (`0x93e2`) 36 px to the left of the energy bar's place, at its height, and
  the bar moves 16 px to the right; it swells for a quarter of a second every two.
- `Plane::say(icon)` (`0x5bd4`): plays the voice for the mood (`TalkHappy`, `TalkNormal`,
  `TalkUpset`, `TalkMad`), runs the talking mouth, turns the eyes for a second and shows the
  icon in the speech balloon for two seconds. It is called with the plane's need when an order
  is given to an idle plane (state 0 or 2, empty queue) for a place it cannot enter (`0x5b10`),
  and when the next queued order turns out impossible (`0x7340`, `0x7a10`).
- Web version: the award counters are not kept.

## Painting stop spot — confirmed

Class with vtable `0x17b1e8`, built by `0x145a8(position, variant, 42.0)`; variant 0 in Arches,
2 on the island. It is a stop spot (same slots for accepting, reserving and the drain, which its
base constructor `0x78cb8` sets to 0.5; click area ±35 × ±20 around the position).

- Charge: `+0x74` is the recharge time (42 s) and `+0x78` what is left, starting full, so the
  first repaint has to wait. At zero `+0x80` is set and `SOUNDS.PAINTING_READY` plays (`0x67e24`).
- Level colours (`0x133fc`, `airport+0x15c`): the colours 1–7 that appear in the level's
  schedule, in table order.
- While a plane waits on a charged spot (plane state 2), a chooser (`0x68f08`) is created 55 px
  right and 20 px above the spot with every level colour but the plane's. When the plane leaves
  state 2 the spot is freed and the chooser dismissed.
- Chooser (`0x68bf4`, `0x68854`): closed, it takes touches in x ±30, y −30…+40 and shows a ring
  of `PAINTING_STOPSPOT.READY` discs, each 10 px off the centre, turning twice a second (app
  clock `+0x1ec`); one colour makes three discs and two make four. Held down it opens (5/s):
  touches in x ±90, y −(30+30n)…+40; rows of `COLOR` + `COLOR_SHADING` stack 30 px apart
  upwards; the row under the finger, `floor((y0 − y)·n / (30+30n))`, is full size, the others
  half and pushed 10 px away; the mark slides at 6·(⌊gap⌋+1) rows/s. Letting go on a row calls
  `paint` (`0x68e28`).
- `paint(colour)` (`0x68014`): plane state 8 (`0x6354`), spot state 2, and a spray object
  (`0x7796c`, `SOUNDS.PAINTING`). The spray (`0x77a80`) fades in over 0.5 s, sets the plane's
  colour after 4 s (`0x5a5c`), starts fading out at 5 s and at 5.5 s calls `0x67df8`: plane back
  to state 2, +0.4 energy (`0x9b18`), recharge restarted. State 8 loses no energy and is
  selectable.
- Plane colour change (`0x5a5c`, `0x90d2`): `+0x34c` keeps the old colour and `+0x350` runs from
  1 to 0 in a second; the body is drawn `old·w + new·(1−w)` with `w` a triangle wave of
  `7·(+0x350)`.
- Sign (`0x68584`): `RIGHT_OFF` (`RIGHT_OFF_ISLAND` for variant 2) at spot + (7, −33), `RIGHT`
  over it with the ready fade (3/s) as opacity; `CHARGING` at + (50, −52), showing the rows
  below `height · left/recharge`, pulsing 0.8 ± 0.2 at 5 rad/s once lit. Sorted at spot y − 15.
- Spray draw (`0x77b78`): can = `SPRAY_COLOR` tinted + `SPRAY_TOP`, rotated `20·sin 5t − 13`°,
  at (45 + 4·sin t, 15·cos t − 20), mirrored, at the plane (15 px further left for variant 2);
  `SPRAY_RAY` tinted at (−6, −17) on the can, flickering.
- Web version: the turning direction of the ring and the can's rotation sign follow Pixi's
  convention, not checked against the engine's.

## Service tabs: coffee and cake, in-flight movies — confirmed

- The stage script ends with `0x12f90(airport, 0, owns 0x73, owns 0x74, owns 0x6e, owns 0x6f,
  owns 0x70)`. The last three are stored as bytes at `airport+0xac…0xae` (use not read). For
  `0x73` (in-flight movies) it creates a tab at (354, 11), otherwise a `GUI.INGAMEGUI.GRIP`
  filler at (354, 9); for `0x74` (coffee and cake) a tab at (395, 11) or a filler at (395, 9).
- Tab base class `0x24010(position, recharge)`: touch area x ±20, y −5…+36. `+0x24` counts down
  from the recharge time, starting full; once below zero the tab is ready (`+0x34`) and its
  ready sound plays (`0x240f4`). Coffee and cake recharges in 50 s (`0x243d8`).
- Pressed while ready (`0x244a8`): its sound, the countdown restarts and `0x107d4` gives +0.5
  energy to every plane that has landed (`+0x268`) and not finished loading (`+0x26f`). The
  movies equivalent (`0x1080a`) gives +0.6 to every plane that has not landed.
- While the finger is on a ready tab (`0x244d0`), `0x1083c` sets `plane+0x284` on the planes it
  would reach.
- Draw (`0x24170`): the `_OFF` image with its top-left at (x − w/2, y − 10 − (h − 20)·(1 − f)),
  `f` being the ready fade (6/s), stretched vertically by `1 + 0.3·sin(πf)` while not ready;
  the `_ON` image over it with the touch fade (5/s) as opacity. It is drawn behind the bar.
- Web version: the tab acts when the finger goes down, not when it is lifted; the mark on the
  planes it would reach (`+0x284`) is not drawn; in-flight movies is not offered in stages 1
  and 2, so only its filler exists.

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
## Level announcement (panel `0x514cc`, draw `0x51be8`)

- After the shop, `0x105bc` opens the panel kept at `app+0x1ac` with the area's title and name
  and the level number, and the level goes to state 3.
- Draw, from the screen's centre: the title "<title> - <LEVEL_NUMBER>" in `FONTS.ULTRA` at y −100
  (−80 when the level has no best score), 20 higher when more than four scores are listed; the
  name 45 below in `FONTS.MAIN`; the first score row 50 below that, shifted 60 px left when the
  level introduces something (a list drawn at the right, not read).
- A score row (`0x51b18`): `GUI.INGAMEGUI.SCORE_GOAL_BACK` in the tier's colour, the tier name
  (`0x12520`) in `FONTS.WHITE` at (−125, −2) and the amount in `FONTS.SCORE` right-aligned at 115.
  Rows are 26 px apart; the best score follows 20 px further down in a darker plate.
- Not read: the tier colours (a table at `0x181314` filled at run time), the list of what a level
  introduces, and how the panel is dismissed. The web version uses its own colours and closes
  the panel with a touch.

## Final report (dialog `0x3241c`, steps `0x328d4`)

- `tools/re/args.py <start> <end> [targets]` traces constants into the arguments of each call;
  it was used to read the dialogs. Widgets: label `0x2cf54(parent, text, align 0 left / 2 right;
  style, x, y, font, …)`, text box `0x2d14c`, frame `0x2c540(width, height)`, backdrop image
  `0x2c890`, horizontal rule `0x2c26c(x, y, width)`, vertical rule `0x2c3c0(x, y, height)`,
  counter `0x3b20c`, button `0x33f04`. Positions are from the dialog's centre.
- The constructor plays `MUSICS.FINAL_REPORT.<tier>` and `SOUNDS.FINAL_REPORT.<tier>`, makes a
  400×250 frame with `GUI.FINAL_REPORT.BACK_STAR` behind (`SPIRAL` for a failed level), rules
  at y −40 and 54 (width 400) and at x 42 (centres −60 and 10, heights 36 and 82).
- The update adds one step each time its clock passes 0.5; the clock advances 2 per second, plus
  6 more while the screen is touched. Steps: the tier text in `FONTS.ULTRA` in the box
  (−200, −95)–(200, −100); the stars, none for goal up to four for perfect, at (124, −69) /
  (111, −74) (137, −65) / (124, −61) (105, −80) (143, −80) / (124, −61) (98, −74) (150, −74)
  (124, −87); served (`level+0x13c`) at y −65 and lost (`+0x138`) at y −45, label at x −190 and
  value right-aligned at 34, in `FONTS.WHITE`; "Arrivals" right-aligned at (12, −20) and
  "Departures" at (72, −20); early, on time and late at y 0, 20 and 40 with the arrival count
  (`+0x140`…`+0x148`) right-aligned at 34 and the departure count (`+0x14c`…`+0x154`) at 50; the
  level score at y 82 in `FONTS.SCORE` (or `SCORE_NEGATIVE`), right-aligned at 190; and, after a
  whole unit, the Continue button (`0x33f04`, y 110, width 200).
- Each punctuality row grows two bars of `TICK_GREEN` / `YELLOW` / `RED` to
  `floor(count / planes × 100)` px at 20 px per clock unit, with a counting tick sound: arrivals
  leftwards from x 12, departures rightwards from x 72. `planes` is `level+0x134`, counted in the
  plane constructor. Arrivals are judged when unloading starts (`0x6378`), departures at
  take-off (`0x6110`).
- Web version: text baselines, the star's pop, the backdrop's size and turning, and the fonts'
  colour effects are approximations; the score is written at once instead of counting up.

## Stage backdrop

- `0x135f4(level, height)` creates a `Sky` object (constructor `0x74558`, vtable `0x17b768`).
  It draws six vertices across 480 px: the top colour at y 0, the middle one at half its height
  and the bottom one at its height (`0x74be0`). Height is 82 on Arches and 65 on the island.
- Day cycle (confirmed): `0x74358` fills seven keyframes of three RGBA colours and a duration
  (60, 10, 30, 10, 60, 20, 30 s): day, late afternoon, sunset twice, night twice and dawn. The
  update (`0x74b3c`) advances a 0..1 blend by `dt / duration` and `0x74928` mixes the current
  keyframe with the next. A level starts at keyframe 0, so it turns to night after 110 s.
- On entering a keyframe (`0x74b90`): 1 starts the sun, 3 shows the stars, 4 starts the moon and
  5 hides the stars.
- Stars (`0x295fc`, eight added by `0x296f0`): x 26, 93, 195, 240, 362, 523, 699, 767; y at
  0.15, 0.22, 0.375, 0.12, 0.295, 0.305, 0.385, 0.215 of the height; sizes 9, 9, 12, 14, 13, 15,
  10, 11 px. They fade at 0.1 per second and their size follows
  `0.8 + 0.2 * sin(2π (t / 2 + random phase))` (`0x29968`).
- Sun (`0x29bc8`, `0x29c10`): a 0..1 value advancing 0.025 per second; position
  (`400 − 300 v^0.25`, `450 v − 200`); `AMBIENT.SUNRAY` behind it rotated `300 v` degrees and
  scaled `1 + 0.025 sin(200 v)`.
- Moon (`0x29dc0`, `0x29e08`): 0.02 per second, position (`700 − 150 v⁴`, `350 − 400 v`). On a
  480 px screen it is never in view, so the web version leaves it out, as it does the three stars
  beyond x 480.
- Clouds, `0xcda08(height, speed 5)`: six `MovingImage`s (`0x7232c`, draw `0x72440`) with a loop
  of `2 × 1300 / speed` seconds. Each is at x `−100 + speed × ((t + offset) mod loop)` and is
  drawn only in the first half of the loop. Surfaces 1, 2, 3, 1, 2, 3; y at 0.275, 0.325, 0.175,
  0.275, 0.225, 0.325 of the height (floored); offsets 0.3, 0.65, 1, 1.3, 1.55, 1.92 half-loops.
- Nothing was found that darkens the airport at night; the web version does not either.
- `.cgf` files (confirmed, loader `0x977a0` chosen by extension in `0x9705c`): an 8-bit grey PNG
  with the opacity, followed in the same file by a JPEG with the colours. The importer splits
  them and the texture store joins them again. `STAGES.*.BACKGROUND_TOP` are such files: the
  full painted scenery above the ground tile, drawn as a plain `StaticImage` (`0x83e84`), at
  (0, 34) on Arches and (0, 40) on the island.
- The colour each stage script sets before `0x12ddc` is not a backdrop tint: it overwrites entry
  0 of the colour table (`+0x300` and `+0x390`), the colour of a gate no plane has used yet.
  Arches (0.867, 0.769, 0.6), island (0.761, 0.561, 0.212).
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
- Stop spot: vtable `0x17b928`, kind 3.
  - Slot 11 (`0x7983c`): a plane that has not landed needs a runway in its itinerary; a plane
    that has not unloaded is refused once a gate is in the itinerary; a landed, unloaded plane
    (with `+0x26f` clear) is refused once a runway is in the itinerary.
  - Slot 15 (`0x797a8`): only the base check, the plane must have landed.
  - Slot 12 (`0x79788`): spot state 2 and `Plane::setModifier(spot)` (`0x6298`, `plane+0x320`).
    The energy drain multiplies by the spot's `+0x6c` while that is set.
  - Slot 6 (`0x797c8`): when the plane leaves state 2 the spot is freed and the modifier cleared
    (`0x62c4`). Slots 13/14/9: reserve (state 1), busy (state ≠ 0), release.
  - Constructor (`0x79194`): a four-way switch sets `+0x6c` to 0.25, 0.5, 0.25 or 0.5; mapping
    0.5 to the plain spot and 0.25 to the VIP one is inferred. It creates six pass-through nodes
    (offsets built from ±30, ±10, ±15) and five links whose pairing has not been read.

## Game flow, progress and shop (web version)

None of this is reconstructed from the original screens; it is our own flow built on original
data and assets.

- Screens are page loads: no `level` parameter shows the stage screen, `?level=N` plays a level.
  Progress is kept in `localStorage` (`am2web.progress.v1`); `?reset` clears it.
- Stars are the goals reached (0–5). Each newly earned star pays the area's `PerStarAmount`
  (2000 in stage 1). That payout rule is an assumption; `StageClearAmount` is not used yet.
- The shop lists the improvements the stage script registers for Arches, with its ids and prices
  (see above). The original dialog also offers selling (`IMPROVEMENTS_DIALOG.SELL`); not done.
- Owning the plane licence (`0xcb`) switches levels to their `HasExtraPlane="true"` schedule and
  goals. That link is inferred from the data (`ExtraPlane="4"`, `ExtraPlaneNumber="4"`).
- A level opens when the previous one has at least one star: assumed.

## Stage scripts beyond Arches

`tools/re/stage_calls.py <start> <end> [addr=NAME …]` lists the builder calls of a compiled stage
script with the constants set up before each one. On Arches it reproduces the layout read by hand.

Builder entry points (first argument is the airport): `0x1328c` image, `0x13de4` scaled image,
`0x1404c` z-image, `0x135f4` sky, `0xcda08` clouds, `0x13458` improvement (id in r1, price in r2,
sometimes with `0x10000` or-ed in), `0x141ac` gate, `0x1428c` hangar (constructor `0x46c04`),
`0x1434c` gas station, `0x1440c` runway (r2 = descriptor type, r3 = number, then flag),
`0x144e4` stop spot, `0x145a8` painting stop spot, `0x147f8` taxi node, `0x14808` linked node pair.
`0x12ddc` starts the stage; the colour set just before it is the stage's neutral gate colour.

### Stage 2, the island (`0xcf414`, helpers `0xcf1c0` gate + dock and `0xcf370` water runway)

- Backdrop calls in order: sky and clouds at 65; `STAGES.ISLAND.WATER` at y 159, scale 16×15;
  `STAGES.ISLAND.SEA` at (0, 55); `STAGES.ISLAND.BACKGROUND_TOP` (8-bit grey) at (0, 40);
  `STAGES.ISLAND.BACKGROUND_DOWN` at (335, 160).
- Gates A (135, 135), B (385, 195), C (435, 255), descriptor types 2 and 3, each with dock
  sprites at (−25, +30). Gas station type 2 at (52, 105). Hangar at (180, 90) from level 3.
- Runways 1 (50, 195) and 2 (85, 250), descriptor type 2, created with flag 0: node at the right
  end, planes leave to the left. One taxi node at (280, 195).
- Stop spots (`0xd0100`, confirmed): (280, 300) always, VIP with `0x0a`; (170, 300) with `0x01`;
  (60, 300) with `0x02`, or the painting stop spot there when `0x72` is owned, whether or not
  `0x02` is. Arches does the same at (60, 300) with `0x01` (`0xcebba`).
- Registered order of the improvements: `0x01`, `0x02`, `0x0a`, `0x72` (95000), `0x16`, `0x1e`,
  `0x1f`, `0x74` (50000), `0xcc`, `0x20`.
- Improvements (id, price): `0x01` 17000, `0x02` 25000, `0x0a` 40000, `0x72` 95000,
  `0x16` 35000, `0x1e` 35000, `0x1f` 40000, `0x74` 50000 (coffee and cake), `0xcc` 120000
  (plane 5 licence), `0x20` 45000.

### Water effects of the island — confirmed

- Sea glints, `0x13c3c` → `0x729b8`, created after the sea strip with the area (0, 55)–(480, 80)
  and a sag of 11: `area / 80` sprites of `AMBIENT.WAVE_REFLECT` (`0x72740`). For each, with
  `d = rand^3.5`: x is random across the area widened by 15 px each side, y is
  `y1 + 4 + (y2 − y1) d + sag · |x / 240 − 1|`, size `(0.4 d + 0.2) / 2` and a random phase. Drawn
  (`0x72ab8`) while `v = sin(2π (t / 2 + phase)) − 0.3` is positive, scaled by `v · size` with
  alpha `0.7 v`.
- Rings, `0x13950` → `0x86770` (`STAGES.ISLAND.WATER_RING`), kept at `airport + 0x780`. A plane
  below altitude 1 adds one at its position (`0x6cb2`) every
  `clamp(5 / max(5, speed), 0.07, ·) × (0.7 + 0.3 rand)` seconds; the upper clamp is read as 1.
  A ring lives one second (`0x868b0`): alpha `min(1, 2 min(t, 1 − t))`, scale
  `0.25 + 0.75 · size · (1 − t)` with t running from 1 to 0 and size 0.2–1.1 (`0x8690c`).
- Buoys, `0x14104` → `0x23274`: two lines per runway, at (x − 186, y − 27) before the runway is
  created and (x − 166, y + 6) after it. Nine buoys 41 px apart; each rises by
  `(sin(t · a + x) + sin(t · b + x) + 2) / 2` with a in 4.5–8.3 and b in 1.5–4.3, and
  `STAGES.ISLAND.BUOY_MASK` is drawn at its resting place over it (`0x233e8`).
- `0x138ac` → `0x5021c`, created right after the rings, has not been identified.

## Runway drawing — confirmed (`0x6dd44`)

- The strip is drawn at the runway position and its number twice: at (−152, −1) from it, and
  turned 180° at (+152, +1).
- Combo arrows, one row per kind (take-offs `+0x90` with count `+0xbc`, landings `+0x98` with
  count `+0xb8`): `n = timer² × ComboTimeTotal` arrows starting 35 px from the runway node and
  25 px apart towards the runway centre, the last one with alpha equal to the fraction left.
  Take-offs use `INDICATORS.ARROWS.RUNWAY_COMBO_RIGHT` when the runway's direction flag (`+0xc0`)
  is set and `_LEFT` otherwise; landings the opposite. With a count of 2 or more,
  `INDICATORS.ARROWS.X2`–`X4` is drawn over the first arrow.
- Not read: the block at `0x6de06`–`0x6de9a` (three items driven by `+0xa8`/`+0xac`, drawn by
  `0x6e1f4`).

## Hangar — confirmed

Vtable `0x17a8e8`, kind 5.

- Slot 11 (`0x4785c`): refused when servicing is done or not needed, when the plane has not
  unloaded, or when the itinerary already has a hangar.
- Slot 15 (`0x4735c`): landed, unloaded and servicing still pending.
- Slot 12 (`0x47234`): plane state 6, hangar state 2, 0.25 energy.
- Slot 6 (`0x473dc`): progress grows by hangar `Speed` × dt; above `ServicingTime` the hangar
  goes to state 3 and calls `Plane::servicingFinished` (`0x66c8`: service done, need 3 if gas is
  pending, else 5 or 6, target node = the hangar's exit node, plane state 3). When that plane is
  waiting (state 2) `0x472f4` pays `floor(clamp(energy) * HangarPoints / 5) * 5` and the hangar
  goes to state 4; it frees itself when the plane leaves state 2.
- The gas station and the gate accept an unloaded plane with servicing pending only if a hangar
  is already in its itinerary.
- Constructor (`0x46c14`): besides the place node at position + `NodePosition` it adds the exit
  node (`+0x88`) 10 px right and 20 px below it, and pass-through nodes at (−10, +30) and
  (+50, +30). Which pairs are linked is assumed in the web version.
- Draw (`0x47678`): while a plane is serviced, `HANGARS.PROGRESS` at position + (34, 20) and four
  `HANGARS.PROGRESS_TICK`s at (−9, −10), (−7, −3), (−5, 4) and (−3, 11) from it. Tick i (1–4)
  shows once `progress × 4 ≥ (ServicingTime − 1) × i` and pops in over half a unit of that value.
- Web version: the plane is drawn at the middle of the building while it is serviced instead of
  being walked in.

## Money, records and improvements — confirmed

- The profile keeps one record per (stage, level), created on demand by `0x821b8`; a new record
  copies the improvements of the level before. Fields: `+0xc` best score, `+0x10` funds,
  `+0x38` tier (0 not passed, 1 goal … 5 perfect), `+0x3c` the improvements bought.
- The score is the money. On passing a level (`0x34170`): the best score is raised if beaten;
  if this is the furthest level reached, the next level's record gets a copy of this one's
  improvements and `funds = funds + best score`; otherwise the amount the best score rose by is
  added to the funds of the levels already opened after it.
- Stars are `tier − 1`. When a tier improves (`0x119c2`) the stars gained, times this stage's
  `PerStarAmount`, are added to the funds of every opened level of the next stage (`0x115a0`).
- Clearing a stage shows dialog `0x7802c` (400×250): title, rule at y −65 (width 350),
  `AREA_CLEAR_BONUS` with `StageClearAmount` at y −30, `STARS_EARNED` at y −10, rule at y 16,
  `FUNDS` at y 60 with `stars × PerStarAmount + StageClearAmount`, labels at x −175 and values
  right-aligned at 175. Its continue (`0x78a9c`) moves to the next stage, whose first level
  starts with those funds and no improvements. Stage 1 starts with nothing.
- Improvements dialog (`0x4c3c8`), frame 430×270: `IMPROVEMENTS_DIALOG.TEXT_SHORT` centred at
  (55, −130) and the item title at (60, −100) in `FONTS.MAIN`; rules at y −115 and 65 (centre x
  55, width 325); description in `FONTS.WHITE`; `COST` at (−110, 65) and `AVAILABLE` at
  (−110, 95) with the amounts right-aligned at x 220 in `FONTS.SCORE`; Buy/Sell button at
  (−20, 120) and Exit at (140, 120), both 125 wide. Buying (`0x4c020`) needs the level's funds to
  cover the price, takes it and adds the id to the level's record; selling (`0x4bf08`) removes it
  and gives the price back. Sounds: `SOUNDS.IMPROVEMENTS_SCREEN`, `BUY_SOMETHING`, `CANNOT`,
  `CASH`. A hidden button adds 1,000,000 for the tester profile.
- Not read: the list of items (a scrolling list widget, `0x4ca54`), the description's box, the
  "try me" marker (`0x4da44`).
- The dialog object is made once at start-up (`0x4be20`, kept at `app+0x1b4`) and shown by
  `Level::start` (`0xfe8c`) with `MUSICS.SHOPPING` before every level except the tutorial and
  level 1 of stage 1; leaving it starts the level. The web version does the same and reloads the
  level after a purchase or sale, to rebuild the airport.

## Main menu (`0x597b0`)

- Built in this order: background (`0x5d138`), `MAIN_MENU.TOWER` at (36, 77) and
  `MAIN_MENU.FRONT` at (−48, 152) through `0x5c45c` with factors 0.4 and 0.6 (not read; likely
  how far each slides in), the sign (`0x5c250`) at (240, 118), `MAIN_MENU.TITLE` at (213, 43)
  scale 0.8, `MAIN_MENU.FRANCHISE` at (270, 96) scale 0.7, `MAIN_MENU.NUMBER_TWO` at (411, 46)
  scale 0.7, a star badge (`ORANGE`/`YELLOW`) at (95, 200), the Facebook button at (206, 290) and
  `MAIN_MENU.MORE_GAMES` at (95, 290). Music `MUSICS.MAIN`.
- Sign entries (`0x5c030`): Play, Users, Options and Credits at x 119 and y 43, 81, 119, 157 from
  the sign's corner, each a button (`0x5c7a0`) 160×30 with `MAIN_MENU.BUTTON_OVER` and the text
  in `FONTS.MAIN`.
- Not read: the entrance animations, the plane flying past (`0x59f7c`), the greeting sign and the
  dialogs behind Users and Credits. The web menu shows the scene in place, with Play and
  Options working, and leaves out the badge and the promotional buttons.

## Menu dialog (`0x66bbc`) and finish dialog (`0x376c4`)

- `0x66bbc(mode)` is one dialog used two ways: mode 1 from the level's menu button (`0x87a80`),
  mode 0 from the main menu's Options (`0x5cd64`). Frame 340 wide; 240 high in mode 1 and 220 in
  mode 0. With `b = height / 2 − 20`:
  - mode 1: buttons 280 wide at x 0 — Options (`0x67660`) at y `b − 190`, Help (`0x673c0`) at
    `b − 130`, Finish game (`0x67120`) at `b − 70` and `RESUME` at `b`;
  - mode 0, with `t = −height / 2 + 10`: `OPTIONS_DIALOG.SOUND_FX` at (−115, `t + 15`) with a
    switch at x −145 (`0x2f504`) and a slider at x 85 (`0x2f3c4`); `OPTIONS_DIALOG.MUSIC` at
    `t + 65` likewise (`0x2f58c`, `0x2f450`); Advanced (`0x678f8`) at `b − 60` and `BACK` at `b`.
- Finish game opens `0x376c4`, frame 340×260, buttons 310 wide: restart at y −100, map at −40,
  main menu at 20 and `RESUME` at 110.
- Advanced opens `0x2220` (auto-orientate, show tips, tap on bubbles). There is no language
  entry in this build: the language comes from the device.
- `0x6a210` draws `PAUSE.PAUSED` and `PAUSE.TEXT` centred on the screen; it is not opened by a
  button (most likely when the app is interrupted).
- Web version: Help is shown but does nothing; Advanced opens a language choice of our own,
  outside a level only; slider width, button height and the switch's look are assumed; the pause
  screen is not used. Settings are stored in the browser (`am2web.settings.v1`).

## World map (script `0xccc8c`)

- `tools/re/calls.py <start> <end>` lists every call of a compiled script with the constants
  set up before it; it was used to read this one.
- The map image is 2040×510 and everything on it is placed in its pixels. Drawn at half size it
  spans the 480×320 screen above the bar; that scale is inferred from the fit, not read.
- Stage icons, `0x60218(map, stage, levels, x, y)` (`MAP.STAGES.%d`, stage 5 through `0x60408`
  with a propeller): 1 (151, 260), 2 (280, 68), 3 (526, 255), 4 (661, 63), 5 (901, 144),
  6 (1011, 323), 7 (1209, 144), 8 (1360, 323), 9 (1591, 98), 10 (1864, 344).
- Ribbons, `0x6052c(map, stage, x, y)` (`MAP.HERALDIC_RIBBON` with a text, taken to be the
  stage title): y 351, 136, 323, 128, 196, 396, 216, 386, 169, 428 at the icons' x.
- Level markers come from `LEVELS_POSITION_TABLE` (`0x606bc`; some levels are listed twice).
  Marker image (`0x5dc9e`): `MAP.LEVELS.0` for a level not reached, `1` for the profile's
  current level, and `tier + 1` (2–6) for a level passed, tiers running from goal to perfect.
  `MAP.LEVEL_SELECTED` marks the chosen one.
- Bar: `MAP.HUD.BACK` at (0, 261) and `MAP.HUD.REFLEXION` at (8, 269) (`0x609b8`); four buttons
  (`0x60e50`) across x 5–122, 122–240, 240–357 and 357–480, y 267–321, with the labels
  `MAP.MAIN_MENU`, `MAP.TUTORIAL`, `MAP.AWARDS_ROOM` and `MAP.PLAY` centred at y 305 and the
  `…_ON` images shown when pressed.
- Also in the script and not drawn by the web version: `MAP.ISLAND_FRONT`, clouds
  (`0x61210`), wind streams (`0x60bec`), carrier waves, satellites and twinkling points
  (`0x60cc4`), the "coming soon" sign, and the level information dialog (`0x64824`).
- Level dialog (`0x64824`, opened by a marker `0x5dda4` or by the bar's Play `0x5f54c`): frame
  420 wide, `MAP.LEVEL_STAGE_NUMBER` in `FONTS.ULTRA`, the level's five goal scores
  (`0x53c24`), `SCORE.BEST_SCORE` when the record has one, and on the bottom row (20 px above
  the frame's edge) `CANCEL` at x −100 and `MAP.PLAY` at x 100, both 160 wide. Its height and
  the placing of the scores are in a draw routine that has not been read.
- Stage dialog (`0x63c60`, from a stage icon): `STAGES.%d.NAME`, `STAGES.%d.DESCRIPTION`,
  `MAP_INFO_DIALOG.STAGE_CLEARED` with a small star and `x %d`, `MAP_INFO_DIALOG.TOTAL` and
  `CLOSE`. Positions not read.
- Web version: dragging scrolls the map; both dialogs use the original texts and buttons in a
  layout of ours where the positions are not known.

## End of the level — confirmed

In the playing state of the level update (`0x117c6`):

- `level+0x88` is the elapsed time, advanced by `dt × profile+0x48`, and `level+0x130` the
  level's `TotalTime`. When it passes it, `+0x90` is set, `SOUNDS.TIME_OVER` plays and
  `+0x1dc` is set to 3 s, or 10 s if any plane has landed. Play goes on.
- `+0x1dc` counts down (`0x11e00`). At zero the planes are scanned: the first one with energy
  above zero sets it to 6 s; an exhausted one is skipped if it has landed and is waiting
  (state 2), otherwise it sets 10 s (landed) or 6 s. With nobody holding it, `0x10684` ends the
  level.
- `+0x8c` counts the seconds played after the time ran out (reported to the awards, code 0x29).
- Web version: the profile's factor at `+0x48` is taken as 1.

## Still unknown

- Plane update (`0x6af0`): transitions for landing and states 8, 10, 12, 13; taxi speed.
- Taxi node occupancy (set as planes claim nodes) and the stop-spot nodes: not modelled.
- The exact loop bounds of the two runway ring loops (seven nodes each is assumed from the tables).
- Where exactly a landing plane stops and when the runway is freed; the simulation stops it at the runway node.
- Whether a busy front place makes the plane wait (assumed) and the queue reordering at `0x797e`.
- `PATIENCE_VALUES.*` / `SPEED_VALUES.*`.
