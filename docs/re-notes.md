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
- Level-specific branches follow for levels 3 and 6: the bonus events (see "Bonus events").

Improvements registered for the stage (id, price): `0x01` 10000, `0x72` 60000, `0x0a` 20000,
`0x16` 20000 (`IMPROVEMENTS.GATE_0`, confirmed), `0x1e` 25000, `0x1f` 30000, `0x20` 35000
(confirmed), `0xcb` 85000. The meaning of the others follows the string order in the function
(extra storage place, painting stop spot, VIP storage place, improved gates A/B, plane 4 licence):
inferred. Registered order: `0x01`, `0x0a`, `0x72`, `0x16`, `0x1e`, `0x1f`, `0xcb`, `0x20`.
`0x13458` also stores a number per improvement (2 for `0x01`, 4 for `0x16`, 3 for `0x1e`, 1000
for the rest): the level from which the shop marks it "try me" (see the improvements dialog).

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
| 0 | flying, waiting for a landing order | constructor `0x5684` | confirmed |
| 1 | leaving the airport: gave up (`0x6a24`, energy below 0 at a turn while flying) or 2 s after lift-off (`0x7d60`) | plane update `0x6af0` | confirmed |
| 2 | waiting for orders | many (`0x630c`, `0x64ac`, `0x635c`, …) | confirmed |
| 3 | taxiing to the next queued place | `0x6594`, `0x66c8` | confirmed |
| 4 | loading at a gate (second arrival, normally on the same gate) | `0x62cc`, called by gate `0x43238` | confirmed |
| 5 | unloading at a gate (first visit); queue cleared | `0x6378`, called by gate `0x43238` | confirmed |
| 6 | in the hangar | `0x6698`, called by hangar | inferred |
| 7, 9 | gas station phases | `0x6748` | inferred |
| 8 | being repainted on a painting stop spot | `0x6354`, called by `0x68014` | confirmed |
| 10 | unknown, set from `0x56b78` | `0x6820` | unknown |
| 11 | taking off | `0x6110`, called by runway `0x6d584` | confirmed |
| 12 | in the air after the take-off run | `0x7cc2` | confirmed |
| 13 | landing, from the order to the stop on the runway node (selectable, no energy drain) | `0x73c6` | confirmed |

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
- Stop spot constructor (`0x78dc6`): six pass-through nodes at (−30, −15), (−10, −15),
  (10, −15), (−10, 15), (10, 15) and (30, 15) from its node; links from its node to each of
  the last three, and between the fourth and fifth and the fifth and sixth.
- Hangar constructor (`0x46e44`): the exit node at (10, 20) from its node, kept at `+0x88`, and
  pass-through nodes at (−10, 30) and (50, 30); links node–exit, exit to each of the two, and
  the two together; and two terminal nodes at (40, −15) and (−60, −15), linked: a barrier
  behind it.
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
  schedules a blink within 0.5 s; whistling `0x13d7f0` (6 fps, mouths 12–17) with `Whistle1` or
  `Whistle2` at random from `0x5fd0`. It happens while filling up (state 7, `0x7e5c`): `0x6764`
  sets the clock `+0x314` to 3 s plus up to 5 at random; when it runs out, a plane above 0.5
  energy whose mouth is free whistles, once.
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
    `28 − DespY`. Alpha `(v − 0.25) / 0.75`. While the speech timer (`+0x218`, set to 2 by `0x5bd4`)
    runs from 1.8 to 1.3, `INDICATORS.GLOBE_NAG` is drawn over it (`0x9892`), mirrored like the
    balloon, at scale `timer − 0.3` and opacity `2·(timer − 1.3)` times the balloon's.
  - Thought cloud `INDICATORS.THOUGHT_A`–`D`: on while the plane is flying or waiting with orders
    queued. The cloud is 50 px aside (left for corners 0 and 2) and 80 px above or 15 below; the
    trail D, C, B sits at (−19, 18), (−13, 19), (−7, 15) from it, mirrored the same way; puff i
    of 4 has alpha `min(1, 5v − i)`; the next place's image (`place+8`) is drawn in the cloud
    with alpha `4v − 3`. That image is `INDICATORS.THOUGHT_ICONS.<n>` (`0x6abc8`), `n` being the
    number the place's constructor passes to the base one (`place+0xc`): runway number − 1, gate
    index + 5, gas station 10, hangar 11, stop spot 12, painting stop spot 15.
  - The corner comes from the place the plane is at (`place+0x58`, `0x75f0`), given by the stage
    scripts: 1 for gates, gas station and hangar, 0 for Arches' runways and 1 for the island's
    (the last inferred from its helper); a new plane has 3. Stop spots, the painting stop spot
    and the wash and go get 0 in stages 1, 2, 4 and 8 and 1 in stages 3, 5, 6 and 7 (the last
    argument of `0x144e4` and `0x145a8`, the fourth of `0x14678`).
- Web version: gear fold rate (4/s) and selection fade are assumed.

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
- `Plane::say(icon)` (`0x5bd4`): plays a sound by mood (`plane+0x25c`): the `Cannot` sound
  (`plane+0x2c`) for moods 0 and 1, `TalkUpset` (`+0x1c`) for 2 and `TalkMad` (`+0x20`) for 3.
  The plane also caches `TalkHappy` (`+0x14`), `TalkNormal` (`+0x18`), `Loading` (`+0x24`) and
  `Unloading` (`+0x28`). It runs the talking mouth, turns the eyes for a second and shows the
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
- Gate service indicator (`0x439b0`, confirmed), for state 3 (unloading) and again for state 2
  (loading) with the other set of images. `p` is the service clock `gate+0xd4` and `T` the
  plane's `LoadingTime` (`0x5a98`):
  - the four arrow frames are all drawn at gate + `ArrowsPosition`, frame `j` with opacity
    `sin(π·(1 + 2p + j/4))`;
  - the icon at gate + `IconBarPosition`; from 12 px above it, bar segments 7 px apart going up:
    `n = (T − p)/T · ((T − 8)/2 + 8) / 2` of them, the whole part solid and one more with the
    fraction as opacity.
- Colour multiplier (`0x43cdc`): `INDICATORS.X%d` at gate + `BonusPosition` whenever the gate's
  combo (`+0xc4`) is 2 or more, not only during service.
- Hover label (`0x43d2a`): only for descriptors with `LabelOver`, when the pointer is over the
  gate; not drawn in the web version.
- Not read: the first part of the gate draw (`0x436e4`–`0x439ac`: building, colour, letter) and
  the order flag offsets. The runway draw is covered under "Runway drawing".

## Gas station drawing — confirmed

Draw routine `0x40ed4`:

- `SurfaceSpotResource` at station + `NodePosition`, then `BackSurfaceResource` at the station.
- While fueling (state 2), with `f = progress / FuelingTime` (`0x5aa8`, descriptor `+0xd4`): the
  gauge sits at station + `NodePosition` − (0, 80). Opacity `a = clamp(20·min(f, 1 − f), 0, 1)`.
  `INDICATORS.FUELING_MARK` is drawn at scale `0.5 + 0.5a`; `FUELING_MARK_TICK` at scale
  `0.7 + 0.3a`, rotated `−80 + 160·clamp((12f − 1)/10, 0, 1)` degrees about its hot spot.
- Plane times in the descriptor: `+0xc8` LoadingTime, `+0xd4` FuelingTime, `+0xd0`
  LuggageLoadingTime, `+0xcc` ServicingTime (getters `0x5a98`, `0x5aa8`, `0x5ab8`, `0x5ac8`).

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
- Tier colours (confirmed): the table at `0x181314` is filled by the static initialiser
  `0x4f788` with five RGBA colours, goal to perfect: `#FFAC32`, `#E6E530`, `#6FE546`,
  `#50AFFF`, `#A055CC`. The bar's draw (`0x4ec78`) reads the same table.
- Not read: the list of what a level introduces, and how the panel is dismissed. The web
  version closes the panel with a touch.

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
- Gates A (335, 135), B (385, 190) or (385, 195) when upgraded, C (435, 255), descriptor types
  2 and 3, each with dock sprites at (−25, +30). (An earlier hand reading had gate A at x 135
  and missed that the upgraded gate B sits 5 px lower; the emulated run settled both.) Gas station type 2 at (52, 105). Hangar at (180, 90) from level 3.
- Runways 1 (50, 195) and 2 (85, 250), descriptor type 2, created with flag 0: node at the right
  end, planes leave to the left. Taxi nodes at (280, 195), (300, 225) and (320, 255).
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
- The builder is `0x13c3c(airport, area, density, size, drift, sag)`: the number of sprites is
  multiplied by `density` and their size by `size` (`0x72740`), and while a glint shows it is
  moved sideways by `(w − 0.5) · drift · size`, `w` being how far along its two second beat it
  is (`0x72b6c`). The island gives (1, 1, 0, 11); the carrier, over (0, 47)–(480, 85),
  (1, 1, −200, 11), so its sea slides by; the tutorial, over the lake (0, 58)–(62, 75),
  (2, 0.4, 0, 0). In which order the slide and the glint's own scale are applied has not been
  settled: the slide is applied unscaled.
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
- In-use arrows (`0x6de06`, drawn by `0x6e1f4`, before the combo arrows). Reserving the runway
  (`0x6d9e4`) sets `+0xa4` and clears the phase `+0xac`; `+0xb0` is the direction flag `+0xc0`
  for a landing and its opposite for a take-off. The update (`0x6db18`) advances the phase by
  0.3/s, wrapping at 1, and fades `+0xa4` into `+0xa8` at 3/s; the flag is cleared when the plane
  gets there (`0x6d93a`, `0x6dd22`). Four arrows are drawn at phases `t`, `t + ¼`, `t + ½`,
  `t + ¾`: `INDICATORS.ARROWS.RUNWAY_USING_LEFT` or `_RIGHT` on the node's line, from 260 to
  40 px from the node for a landing and from 40 to 260 for a take-off, with opacity `+0xa8`
  times a fade over the first and last tenth of the run.

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
- List of items (`0x4ca54`, confirmed): one per improvement the stage registered (entries of
  0x34 bytes at `airport+0xa0`: price `+0x24`, id `+0x28`, a level number `+0x2c`, a visible
  flag `+0x30`), in that order. The dialog itself applies no prerequisites: those come from the
  stage script, which registers some offers only under conditions (see below). An item (`0x4e08c`) holds
  the icon's `.ACTIVE` and `.GRAYED` images and `IMPROVEMENTS.BOUGHT`, and is told whether it is
  owned, whether the level's funds cover its price, and whether to mark it "try me": not owned,
  affordable, the current level at or past its level number (2 for `0x01`, 4 for `0x16`, 3 for
  `0x1e`, 1000 for the rest) and not owned in any earlier level of the stage.
- The list is drawn (`0x4dd80`) fading out between 105 and 115 px above and below its centre.
- Not read: where an item's parts sit, the description's box, and the "try me" marker's draw
  (`0x4da44`, text `IMPROVEMENTS_DIALOG.TRY_ME`). The web version does not draw the marker.
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

## Patience and loading speed labels — confirmed

The plane descriptor parser (`0xa9c4`) keeps `Patience` and `LoadingSpeed` as strings
(`+0xa0`, `+0xa4`). They are text ids (`PATIENCE_VALUES.HIGH` → "Alta", `SPEED_VALUES.FAST` →
"Rápida") for the plane's card, not rule inputs: how patient a plane is comes from its
energy fall times and how fast it loads from `LoadingTime`.

## Landing — confirmed

State 13, with a phase in `plane+0x330` and a clock in `+0x314` (`0x7eb2`). Position is
`+0x2d8/+0x2dc`, speed `+0x2e0/+0x2e4`, acceleration `+0x2e8/+0x2ec`, altitude `+0x2f0`.

- Start (`0x738c`): the runway leaves the queue and is reserved, the `GoingOut` sound plays and
  the acceleration is set to 150 px/s² towards the side the plane will come back from (+x when
  `runway+0x34` is 0).
- Phase 0: the plane flies off. For 1.5 s its vertical speed is `50·(t − 1.5)²`, a dip of about
  56 px; the scale (`+0x290`) grows to 1 at 0.2/s. When x is below −500 or above the screen
  width + 500: `Landing` sound, position = runway node ∓ 750 in x at the node's y, speed
  ±250 (`0x1772e0`), no acceleration, phase 2.
- Phase 2: the clock runs at 250/600 per second; altitude = `100·cos(πt) + 100`. The gear flag
  `+0x250` is set when less than 0.6 s is left. At 1 (600 px on, 150 px short of the node):
  altitude 0, `TouchingLand` sound, acceleration = `(pos − node)·v² / (2·d²)`, which stops it on
  the node; altitude speed 10 and acceleration −10; phase 3.
- Phase 3: a quarter of a second (clock at 4/s), with dust from `0x6870`; then phase 4.
- Phase 4: until `(node − pos)·v ≤ 0`. Then the runway's slot 12 is called (it scores the
  landing), the plane is put on the node, state 2, need 1 (unload), `+0x268` set, and a
  pregnant passenger or an organ is delivered.
- Plane sounds by descriptor offset: `+0x5c…+0x68` TalkHappy/Normal/Upset/Mad, `+0x6c` In,
  `+0x70` Out, `+0x74` Cannot, `+0x78` Landing, `+0x7c` GoingOut, `+0x80` Launching, `+0x84`
  TouchingLand, `+0x88` Loading, `+0x8c` Unloading, `+0x90` Whistle1, `+0x94` Whistle2.
- Pitch (`+0x2fc`, degrees, nose up): −5 at the start of phase 2, rising 5 a second through
  the glide; in phase 4 it falls 40 a second to zero (`0x826a`). After lift-off (state 12,
  `0x7d34`) it is `10·t²`. The plane's transform (`0x8584`) applies it as a rotation between a
  translation of (0, 25) and one of (0, `OffsetY` − 28), before the mirroring for planes facing
  right, so the body turns about a point 25 px above its origin.
- The dust is a smoke tail (class `SmokeTail`, made by `0x757c0` and kept at `plane+0x278`;
  `0x757b8` ends it). The plane's update calls `0x6870` unless `app[0xfc]+0x780` is set: in
  phase 3 (`0x8234`), in phase 4 while its clock is under 1 s (`0x82da`), and on the take-off
  run while `½·a·t²` is under 100 (`0x7cac`).
  - `0x6870(plane, dt)` takes the speed at the middle of the step, on screen:
    (`vx + ax·dt/2`, `vy + ay·dt/2` less the altitude's own), and a strength from it
    (speed/200, over ten times the altitude when that is above 1, kept between 0.2 and 1), and
    hands `0x758b0` the plane's place (`+0x30c`, `+0x310`), its depth less one, the speed and
    the strength.
  - `0x758b0`: the tail's clock (`+0x14`) loses dt; while it is under zero a puff is made
    where the tail is, aged by what the clock has overrun, the place moves on by the speed
    times the period, and the clock gains the period: `max(0.005, 1/(20 + 0.1·speed))`
    (globals `0x178b34`, `0x178b38`). The strength is multiplied by a literal 0 and added to
    1, so every puff is made with 1.
  - Puff (`0x75b1c`, `EFFECTS.SMOKE`): speed (`rand·14 − 7`, `−rand·7`), angle `rand·360`,
    spin `rand·90 − 45`, scale `0.2 + 0.3·p` growing at `0.3·p` a second (p the 1 above), a
    clock rising at 2 a second to 1. Drawn (`0x75d44`) scaled, turned, with opacity twice
    the clock under a half and `2 − clock` after.
- Web version: the speed is taken from the plane's movement on screen between frames, and the
  flag at `+0x780` is not looked at. That positive pitch lifts the nose is taken
  from the values making sense that way round, not from the engine's rotation sign.

## Orders of a plane waiting on the ground — confirmed

State 2 with a queue (`0x7952`):

- Skipping parking (`0x797e`, behind a flag at `0x1772d4` that is always 1): entries are walked
  from the front while the place answers 1 on slot 17 (stop spots and painting stop spots; gates
  and runways answer 0) and is free. If the entry reached is free, accepts the plane (slot 15)
  and can be routed to (`0x6aa8`), the entries before it are erased.
- The front place refuses the plane (slot 15): the plane says its need, the queue is emptied and
  the `Cannot` sound plays (`0x7a08`).
- The front place is busy: the plane waits, unless there is a circle (`0x7ab4`). From this
  plane, the place wanted must be busy, accept the asker, and be held by a plane in state 2 with
  orders of its own; that plane's first order is looked at next. A place met twice stops the
  search. If the chain reaches the place this plane stands on (`+0x344`), every place in it is
  released and every plane in it starts its order (`0x6594`); award counter 0x18 gets the count.
- Otherwise, if a route exists, the order starts (`0x6594`).

## Holding pattern — confirmed

State 0 with a phase in `plane+0x330` (`0x6f78`); the flight speed is 80 (`0x1772d8`).

- Phase 0: flying right on the far lane (y 680, scale 0.8). At x ≥ 380 a plane with energy
  below zero gives up (`0x6a24`); otherwise phase 3 with its clock at `(x − 380) / 80`.
- Phase 3: the clock runs at 0.5/s. `x = 380 + sin(πt)·80/1.5`, `y = 680 + 25·sin(πt/2)`,
  scale `0.8 + 0.2·sin(πt/2)`. At 1: y 705, scale 1, speed −80, phase 1.
- Phase 1: flying left on the near lane. At x ≤ 100 the same choice; phase 2 with its clock at
  `(100 − x) / 80`.
- Phase 2: the mirror turn, `x = 100 − sin(πt)·80/1.5`, back to y 680 and scale 0.8, phase 0.
- Stop spot touch area: ±35 × ±20 around its position (`0x7921e`, same in `0x78d44`).

## Taxiing — confirmed

State 3 (`0x74bc`): the plane accelerates at 200 px/s² (`0x1772b8`) towards its current node, up
to 200 px/s (`0x1772bc`), and brakes at the same rate once the path left (`+0x234`) is no more
than `v² / 400`. It arrives when the node is within 1 px along its direction of travel. Each
node it heads for is marked taken (`node+0xc`), which the router (`0x46200`) reads.

- The plane keeps the node it stands on or heads for (`+0x240`), the one after it (`+0x244`)
  and the target (`+0x248`).
  - With no node ahead (`0x78fa`) the router is asked for the way from its node to the target
    (`0x46200(graph, node, target, &length, 0)`, the length kept at `+0x234`); the first node
    of the way becomes the one ahead and is marked taken. If there is no way it is asked again
    the next frame.
  - Reaching its node with one ahead (`0x76be`), the plane is put on the node, the node is
    let go, the one ahead becomes its node and none is ahead, so the next is looked for at once.
  - The router (`0x46382`) leaves out any taken node, the destination included, when its last
    argument is 0, and any terminal node but the destination.
  - Landing (`0x7402`) makes the runway's node the plane's and marks it; the take-off run
    (`0x616a`) lets its node go; planes changing places (`0x7b9a`) have each place's node let
    go before they set off.
- Web version: planes hold nodes the same way and wait on a node while the way on is taken.
  Taken, not read: that a plane still on its way asks again each frame for a node ahead, and
  that a plane removed lets its nodes go. Where the graph has no way at all between two places
  the plane goes straight, holding nothing. Over the 92 levels the automatic player now loses
  4 planes and scores 1.6% less than without this.

## Plane sounds by event — confirmed

- Spoken need: see `Plane::say`. Landing: `GoingOut`, `Landing`, `TouchingLand` (see Landing).
- Take-off run (`0x6110`): `Launching`. Giving up (`0x6a24`): `Out`.
- Unloading (`0x6378`): the cached `Unloading` handle; loading (`0x62cc`): `Loading`.
- Points awarded (`0x5d2c`, from the runway, gate, gas station and hangar) and the penalty for
  giving up (`0x5de0`): `SOUNDS.CASH` (`plane+0x30`). A combo also plays `SOUNDS.BONUS_X%d`
  (`0x4342c`, `0x6d71c`).

## Time-over sign — confirmed

At the end of the bar's draw (`0x4f39a`), once `(TotalTime − elapsed) / TotalTime` is zero or
less, `GUI.INGAMEGUI.NO_MORE_TIME` (`hud+0x3f8`) is drawn at (14, 0) with opacity
`0.5 + 0.5·sin(11·t)`. Which clock `t` is has not been identified; the web version uses the
bar's own.

## Dirt — confirmed

After the body's front image the plane draw (`0x9220`) draws the dirt image of the current pose
(`plane+0x88 + 4·pose`) while `plane+0x26c` is clear. The constructor sets that byte from the
schedule's `NeedWash` (clear when the plane needs a wash); in state 9, the wash, the dirt fades
out. No plane in stages 1 and 2 needs a wash, so it never shows there.

## When an improvement is on sale — confirmed

The stage script registers an offer (`0x13458`) only under conditions on what the level's
record already owns, so the shop's list changes as things are bought. Worked out by running
each script for every combination of the improvements involved (`stage_layout.py --offers`):

| Stage | Offer | Needs | Withdrawn while owned |
|---|---|---|---|
| Arches | extra stop spot `0x01` | | painting spot `0x72` |
| Arches | painting spot `0x72` | `0x01` | |
| Arches | gate C `0x16` | | its upgrade `0x20` |
| Arches | upgraded gate C `0x20` | `0x16` | |
| Island | extra stop spot `0x01` | | second one `0x02` |
| Island | second stop spot `0x02` | `0x01` | painting spot `0x72` |
| Island | painting spot `0x72` | `0x02` | |
| Island | gate C `0x16` / upgrade `0x20` | as in Arches | as in Arches |
| Stage 3 | extra stop spot `0x01` | | `0x02`, wash `0x77` |
| Stage 3 | wash and go `0x77`, second stop spot `0x02` | `0x01` | `0x02`: painting spot `0x72` |
| Stage 3 | painting spot `0x72` | `0x02` | |
| Stage 3 | gates C `0x16`, D `0x17` | | their upgrades `0x20`, `0x21` |
| Stage 3 | upgraded gates C `0x20`, D `0x21` | `0x16`, `0x17` | |

Everything else is always on sale. The effect is that what another improvement builds on
cannot be sold from under it. An earlier note here said there were no prerequisites; that came
from reading the shop alone.

## Bonus events — confirmed

Some levels have a bonus event, created by the stage script (found by running the scripts; the
"level-specific branches" left unread earlier are these).

- When: the script seeds a Mersenne Twister (`0xa2724`, 31-bit output from `0xa2770`) with
  `stage × 100 + level` and starts the event at `20 + r·(B − 70)` seconds, `r` in [0, 1) and
  `B = (7000 + 1400·(level + min(level, 3))) / (level + 90)` (integer division) in Arches. So
  the moment is the same every time. The helicopter takes a number before that one: even means
  it comes from the left.

| Level | Event | Starts at | Coin |
|---|---|---|---|
| 1-3 | helicopter from the right, speed 0.9 | 69.2 s | 500 |
| 1-6 | balloons | 22.3 s | 750 |
| 2-1 | balloons | 28.4 s | 750 |
| 2-6 | helicopter from the right, speed 1.0 | 153.7 s | 1000 |
| 3-2 | balloons | 38.0 s | 750 |
| 3-6 | helicopter from the left, speed 1.0 | 102.7 s | 1000 |
| 3-8 | balloons | 109.9 s | 1000 |

- Balloons (`BalloonsBonus`, builder `0x13ac4`, update `0x21a48`): ten balloons, the next one
  1 to 2 s after each (libc `rand`). A balloon (`0x222f8`) starts at y 350 and a random x in
  10…470 with one of three images, rises 100 px/s (`0x21fc0`) and goes at y −30; it takes
  touches within 30 px. It is drawn (`0x21ee8`) leaning `3·sin(0.05·y)` degrees, thread and
  all, the balloon itself turned back upright about a point 20 px above. Popped (`0x22044`):
  `SOUNDS.BALLOON_POP` at pitch 0.98…1.02, a `BALLOON.SPLASH` and a coin 20 px below. A float the
  builder also receives (10, 15 or 20) is stored and not used by the update or the draw.
- Helicopter (`HelicopterBonus`, builder `0x139fc`, update `0x49518`): `SOUNDS.HELICOPTER_LOOP`
  at half volume, panned by `(x − 240)/240`. Its progress `t` advances by
  `speed + 8·burst` a second, the burst falling at `speed` a second; `x = 520 − 60t` (or
  `−40 + 60t` from the left), `y = 200 + 15·sin(1.5t + a) + 20·sin(t + b)` with random `a`, `b`.
  It takes touches within 40 × 30 px; a tap (`0x4974c`) releases a coin 20 px below, sets the
  burst to 0.4, adds 0.25 to the speed and plays `SOUNDS.COIN_RELEASE`. It is drawn with frame
  `⌊30t⌋ mod 4` of `HELICOPTER.%d`, mirrored when it comes from the left, and goes once past
  the far edge, its sound fading over half a second.
- Coin (`CoinBonus`, `0x26224`, update `0x260d4`): `COIN_BONUS` grows to full size in a quarter
  of a second, falls at 50 px/s (`0x177d64`) swinging `35·sin(2.3·t)` degrees, and on passing
  y 290 pays (`0x25de0`): the amount is added to the score, shown in `FONTS.SCORE` and
  `SOUNDS.CASH` plays; then it shrinks away. It needs no touch.
- Web version: how the splash is animated has not been read (it grows and fades over 0.3 s);
  the award counters the events raise (code 0x20) are not kept.

## Stage 3 ("Monsters") — read with the emulated script (`0xd07bc`)

- Gates of descriptor types 4 and 5 (upgraded): A (365, 145), B (395, 188), C (425, 231) with
  `0x16` or `0x20`, D (455, 274) with `0x17` or `0x21`; upgrades `0x1e`, `0x1f`, `0x20`, `0x21`.
- Gas station type 3 at (60, 107) and hangar type 1 at (170, 107), both from level 1.
- Taxi nodes (250, 195), (270, 225), (290, 255), (355, 315), (370, 315), (355, 300).
- Runways of type 1 created with flag 0: 1 at (−5, 210) and 2 at (30, 250); with the third
  runway `0x34` they are 1 (−5, 195), 2 (30, 225) and 3 (65, 255).
- Stop spots: (270, 300) always, VIP with `0x0a`; (170, 300) with `0x01`, replaced by the wash
  and go at (169, 301) with `0x77`; (50, 300) with `0x02`, or the painting stop spot there with
  `0x72`.
- Backdrop in order: `STAGES.MONSTERS.SKY` scaled 24×24; `BACKGROUND_DOWN` at (0, 153) scaled
  16×17; `AMBIENT.MOON` at (428, 31); six stars (`0x13b8c`, `AMBIENT.STAR`); scary clouds
  (`0x14aa8`, `SCARY_CLOUD_%d`) and a witch crossing (`0x14b5c`); `BACKGROUND_TOP` at (0, 45);
  `TOWER` at (260, 45); `AIRPORT_BUILDING` at (385, 60); five patches of scary fog (`0x149d4`,
  `FOG_%d`) and five bats (`0x14f6c`, `BAT.%d`). The neutral gate colour is (1, 0.8, 0.7).
- Service tabs: in-flight movies `0x73` and coffee and cake `0x74`.
- Offers and their conditions: see "When an improvement is on sale". Bonus events: see "Bonus
  events".

## Wash and go — confirmed

Class with vtable `0x17beb8`, kind 6, built by `0x14678` on the stop spot's base constructor
(`0x78cb8`: thought image 13, drain factor 0.5, touch area ±35 × ±20).

- It accepts what a stop spot accepts (slot 11 is `0x7983c`), needs the plane landed, and counts
  as skippable in a queue (slot 17, `0x8585c`) once the plane is clean (`plane+0x26c`).
- Washing is never one of a plane's needs: after unloading the next need is the hangar, then
  gas, then luggage or loading (`0x64ac`; flags `+0x26a` service, `+0x26b` gas, `+0x26c` wash,
  `+0x26d` luggage). It is something the player chooses to do.
- A dirty plane arriving (`0x84d60`): `SOUNDS.WASHING`, state 2 with its clock at 8 s, rollers
  set for 6.5, 6 and 5 s, plane state 9. A clean one just waits there (state 4), as on a stop
  spot.
- Update (`0x852b0`): with 6 s left the plane becomes clean (state 3); at zero the plane waits
  again (`0x67c8`), gets 0.4 energy, and scores `round5(clamp(energy) × WashingPoints)`
  (descriptor `+0xbc`). The place stays taken (state 4) until the plane moves off.
- Its own draw (`0x853b4`) is `WASH_AND_GO.GRATING` at its position. The shower, the three
  rollers, the water and the splashes are objects of their own (`ShowerWater`, `WashingRoller`,
  `WaterSplash`, `CleanShinyStar`).
- Built by the constructor (`0x84a8c`), each sorted by its own depth: the shower
  (`WASH_AND_GO.SHOWER`, a static image) at the wash's place, depth y − 15; two rollers
  (`0x865fc`) at (−48, −11) and (−30, +15), depth their y − 10; the water (`0x86524`) at the
  wash's place, depth y + 2. The start (`0x84d60`) sets their clocks to 6.5, 6 and 5 s.
  - Roller (`0x85f28`, images `ROLLER_0`…`3`): shown while its clock is between 0 and 6;
    moved sideways by `30·(1 − cos(2π·clock))` while the clock is between 1 and 5; frame
    `int(10·clock) mod 4`; opacity `clamp(2·min(clock, 6 − clock))`.
  - Water (`0x85d60`, `WATER_0`…`2`): shown between 0 and 5; frame `int(10·clock) mod 3`;
    opacity `clamp(min(clock, 5 − clock))`.
  - The start also makes three `CleanShinyStar` (`0x86408`, `AMBIENT.STAR`, depth y + 50) at
    (−25, −35), (5, −10) and (20, −20) with clocks 8.75, 8.25 and 8.5 and spins −300, 300 and
    −250, at a random angle. A star (`0x85b90`) shows in its clock's last second: scale
    `2·min(c, 1 − c)`, opacity `clamp(10·min(c, 1 − c))`.
  - And four pairs of `WaterSplash` (`0x86320`, `SPLASH_<i mod 3>`, depth y + 100), pair i with
    clocks `8 + 0.1·i` and `8.05 + 0.1·i`: from (∓10, −35 + rand·25), speed
    (∓(90 − rand·50), −90 + rand·50), falling at 150. A splash (`0x85950`) moves and shows in
    its clock's last second: scale `1.3 − 0.6·c`, opacity `c·clamp(6·min(c, 1 − c))`, coloured
    (`1 − c + 0.608c`, `1 − c + 0.957c`, 1).
- The dirt during the wash (`0x923a`): opacity `clamp((8 − t)/4 − 1)` with t the seconds in
  state 9; it stops being drawn once the plane is clean, two seconds in.
- Web version: the pictures are placed by the point their resource names.

## Runway fog — confirmed

- The levels database gives each level a number of fogs (and of ices and sands for later
  stages). Stage 3: none on levels 1 and 2, one on 3, two on 4 and 5, four on 6, two on 7 and 8.
- Schedule (`0x102d8`): `TotalTime − 30` is cut into that many equal slices and each fog gets a
  random moment in its slice and a random runway (libc `rand`), retried up to 30 times so that
  no two on the same runway are within 30 s. Entries hold the runway index, the kind (0 fog, 1
  ice, 2 sand) and the time. The ices and then the sands follow in the same way, each with 20
  tries and 40 s apart from any other entry on the runway, and the list is then sorted by time
  (`0x15234`, a stable list sort comparing `+16`). An entry that finds no moment is left out.
- Only the first entry of the list is looked at. When its time comes (`0x1094c`) the fog is created (`0x6d354`, kept at `runway+0xd0`) once the
  runway is not busy and has been idle for more than 3 s (`runway+0xd8`); after 25 s of waiting
  it is dropped.
- A runway with fog refuses every plane (`0x6da72` in slot 15). Likewise ice (`+0xcc`) and sand
  (`+0xd4`).
- Fog (`0x3a41c`): fades in over half a second, lasts 15 s from when it appeared, then frees
  the runway and fades out. With the anti-fog improvement `0x6f` (`airport+0xad`), an anti-fog
  machine (`0x19a7c`) appears 2 s in, runs for 5 s and then ends the fog (`0x3a40c`) with
  `SOUNDS.ANTI_FOG_DEICER_FINISH`.
- Fog draw (`0x3a5a0`): five `FOG` images along the runway at x −128, −64, 0, 64 and 128 from
  its position and 20 px above, with the fade as opacity, each leaning by
  `0.1·sin(0.75·age + k)` about a point 30 px below its centre, `k = 7i mod 11`. A flag passed
  by the stage (`airport+0x7c`, clear in stages 1 to 3) tints it green. It is sorted 4 px in
  front of the runway's line.
- Anti-fog machine draw (`0x19c40`): at the runway's position + (170 − 35·t, −30), so it sweeps
  along the runway; `ANTI_FOG.BASE`, then `ANTI_FOG.PROPELLER` turning three times a second and
  squeezed to 0.8 across, then `ANTI_FOG.NOSE`. Its fan is `SOUNDS.ANTI_FOG_SYSTEM_FAN`.
- Web version: the machine's wobble as it appears is left out.

## Reading a stage script by running it

`tools/re/stage_layout.py` runs a compiled stage script in the Unicorn emulator (installed in
`.tools/venv`). The image is mapped at its own addresses, the script gets a made-up airport,
application, profile (stage at `+0x1c`, level at `+0x20`) and level record (owned improvements
at `+0x3c…+0x40`), and every call that leaves the scripts' code (`0xce178`–`0xe4704`) is
intercepted: its registers and outgoing stack words are written down, following pointers to
positions and texts, and it returns a blank object. Virtual calls on those objects land on a
trap page. `--all` runs it again once per improvement id the script tests and lists what each
one adds, removes or changes; `--level` shows what depends on the level.

- Checked against Arches (`0xce178`): it reproduces the layout already confirmed by hand.
- On the island (`0xcf414`) it corrected gate A's x, gate B's two positions and the number of
  taxi nodes.
- Limits: what a builder does with its arguments still has to be read; a call whose return
  value the script tests gets a blank object, which may take a branch the game would not.

## Stage 4 ("North Pole") — read with the emulated script (`0xd2958`)

- Gates of descriptor types 6, 7 (improved) and 8 (improved again, new here): A (40, 105),
  B (110, 105), C (180, 105) with `0x16`, `0x20` or `0x2a`, D (250, 105) with `0x17`, `0x21` or
  `0x2b`. First upgrades `0x1e`–`0x21`, second upgrades `0x28`–`0x2b`.
- Gas station type 4 at (420, 255), hangar type 2 at (340, 85) and luggage conveyor type 1 at
  (440, 120), all from level 1.
- Taxi nodes (250, 225), (290, 225), (265, 245), (305, 245), (280, 265), (320, 265), (360, 300),
  (380, 300), (380, 312).
- Runways of type 3 created with flag 0: (−5, 217) and (30, 257); with `0x34`, (−5, 202),
  (30, 232) and (65, 262). Stop spots, wash and go and painting stop spot as in stage 3.
- Backdrop: sky 70, `BACKGROUND_DOWN` at (0, 162) scaled 16×14.5, clouds, `BACKGROUND_TOP` at
  (0, 45), and Santa's sleigh (`0x13f84`). The neutral gate colour is (0.549, 0.345, 1).
- Offers in the order registered: `0x01` 25000, `0x77` 160000, `0x02` 35000, `0x0a` 60000,
  `0x72` 160000, `0x16` 60000, `0x17` 70000, `0x1e` 55000, `0x1f` 65000, `0x20` 75000, `0x21`
  85000, `0x28` 50000, `0x29` 60000, `0x2a` 70000, `0x34` 120000, deicer `0x6e` 100000, `0x74`
  80000, `0x73` 80000, licence `0xce` 200000, `0x2b` 80000.
- When each is on sale, from the run over every combination: `0x01` hidden by `0x02` or
  `0x77`; `0x77` and `0x02` need `0x01`, `0x02` hidden by `0x72`; `0x72` needs `0x02`; `0x16`
  hidden by `0x20` or `0x2a`, `0x17` by `0x21` or `0x2b`; `0x1e` hidden by `0x28`, `0x1f` by
  `0x29`; `0x20` needs `0x16` and is hidden by `0x2a`, `0x21` needs `0x17` and is hidden by
  `0x2b`; `0x28`, `0x29`, `0x2a`, `0x2b` need `0x1e`, `0x1f`, `0x20`, `0x21`. Levels to try
  from: `0x01` 2, `0x16` 4, deicer 5, `0x17` 6, `0x1e` and `0x1f` 7, `0x28` and `0x29` 8.
  Stages 5 to 8 are given the same conditions; only stage 4's have been run in full.
- Bonus events: helicopter on level 2 (25.2 s, coins of 1000) and level 8 (64.9 s, 1500),
  balloons on level 6 (132.1 s, 1000).
- Ice per level, from the levels database: 1 on levels 3 and 8, 2 on 4, 5 and 7, 4 on 6.

## Stage 5 ("Airborne") — read with the emulated script (`0xd4f54`)

- Gates of descriptor types 9, 10 (improved) and 11 (improved again), along the building:
  A (345, 147), B (375, 192), C (405, 237) with `0x16`, `0x20` or `0x2a`, D (435, 282) with
  `0x17`, `0x21` or `0x2b`.
- Gas station type 5 at (137, 115), luggage conveyor type 2 at (240, 115) and hangar type 3 at
  (48, 115); with the improved hangar `0x50` the script builds a hangar of type 8 there instead.
- Taxi nodes (250, 185), (265, 205), (280, 225), (295, 245), (355, 312), (370, 312), (355, 300).
- Runways of type 3: (−5, 200) and (35, 240); with `0x34`, (−5, 190), (25, 220) and (55, 250).
  With the VIP runway `0x3c` runway 1 is built with type 7, whose descriptor doubles the combo
  time (10 s against 5 s).
- Stop spots at (270, 300), (170, 300) with `0x01` and (50, 300) with `0x02`; wash and go at
  (169, 301) and the painting stop spot as in stages 3 and 4.
- Backdrop: sky 140, `BACKGROUND_DOWN` at (0, 155) scaled 16×, `BACKGROUND_TOP` at (0, 44),
  `HANGAR_BACK` at (0, 56) and `AIRPORT` at (360, 90). The neutral gate colour is
  (0.804, 0.816, 1).
- Offers in the order registered: `0x01` 40000, `0x77` 300000, `0x02` 60000, `0x0a` 120000,
  `0x72` 300000, `0x16` 120000, `0x17` 135000, `0x1e` 110000, `0x1f` 125000, `0x20` 145000,
  `0x21` 165000, `0x28` 100000, `0x29` 110000, `0x2a` 130000, `0x34` 200000, VIP runway `0x3c`
  220000, improved hangar `0x50` 250000, `0x74` 150000, `0x73` 150000, anti-fog `0x6f` 150000,
  licence `0xce` 400000, `0x2b` 150000. As for stage 4, when each is on sale follows the
  pattern confirmed for stages 1 to 3 and single-improvement runs; the run over every
  combination has not been done.
- Bonus events: balloons on level 2 (39.9 s, 1500) and level 8 (118.3 s, 2000), helicopter
  from the left on level 6 (134.3 s, coins of 1500).
- Fog per level, from the levels database: 1 on level 3, 2 on levels 4, 5, 7 and 8, 4 on 6.

## Luggage conveyor — confirmed

Class with vtable `0x17ad68`, kind 7, built by `0x14738`; thought image 14. Its descriptor
(`luggage_descriptor_table`) gives the speed, images, sound, node, touch area and the belt's
animation.

- Accepts (`0x570a8`) a plane that has unloaded and still lacks its luggage, has no conveyor in
  its itinerary already, and has the hangar and the gas it needs done or in the itinerary.
- May be entered (`0x56c18`) once the plane has landed, unloaded and had its service and gas.
- Arrival (`0x56b78`): 0.25 energy; a plane lacking luggage goes to state 10 and the conveyor's
  sound starts. Update (`0x56ca0`): the clock advances by the descriptor's speed and when it
  passes the plane's `LuggageLoadingTime` the plane waits again with the luggage on and loading
  as its need (`0x6848`), scoring `round5(clamp(energy) × LuggagePoints)`.
- The gate takes an unloaded plane back only with its luggage on or queued (as with gas and
  the hangar).
- Draw (`0x56dac`), in order: the spot image at the node; the back image; the belt, on frame
  `int(animation speed × clock) mod frames` while loading (state 2) and frame 0 otherwise, at
  the animation's place; `LUGGAGES.PARCEL` while loading if the animation has `Parcels`; the
  front image; then the marks.
  - Parcel, with t the fraction of the clock: opacity `min(1, 10·(1 − t))`, scale
    `0.5 + 0.5·opacity`, at the animation's place plus (`100 − 120t`, `(20·max(0, t − 0.8))²`),
    or `120t − 100` across with `ParcelsFlip`.
  - Marks, at `ParcerMarksPosition`: with r the plane's loading time less the clock, one
    `LUGGAGES.PARCEL_MARK` for each second of r, each 10 px above the last; the one for the
    last part of a second has opacity `max(0, 2r − 1)`.
- Taxi nodes (constructor, `0x567f0`–`0x568ba`): besides its own node, a pass-through node
  (`0x45ff4` with flag 0) at each of `AuxNode1` and `AuxNode2` (descriptor `+0x18`, `+0x20`),
  linked (`0x45d58`) to its node and to each other; and a node with flag 1 at each of
  `BarrierNode1` and `BarrierNode2` (`+0x28`, `+0x30`), linked to each other. All from the
  conveyor's place.

## Runway ice — confirmed

- Scheduled like fog (20 attempts each instead of 30, and 40 s apart instead of 30) and created
  by `0x6d41c` at `runway+0xcc`. Class `0x4b71c`.
- It lasts 30 s (`0x4b850`) and plays `SOUNDS.RUNWAY_FREEZING`. With the deicer `0x6e`
  (`airport+0xac`) a deicer (`0x2ac90`, `SOUNDS.DE_ICER_WORKING`) comes 2 s in and ends it 7 s
  later (`0x2ad80`).
- Drawn (`0x4b9d4`) as `RUNWAY.FROZEN` over the runway, with the fade as opacity.
- Deicer (`0x2ac90`, images `DEICER` and `AIR`, depth the runway's y). Update (`0x2ad80`): a
  clock counts up; it comes over half a second (fade + 2·dt), works until the clock passes 7,
  then ends the ice and goes as fast. Draw (`0x2ae50`): turned `20·sin(5t) − 13` degrees,
  stretched by `1 + sin(2πf)·(1 − f)·f` across and `1 + sin(3πf)·(1 − f)·f` down, at the
  runway's place plus (`80 + 90·cos(0.5t)`, −15), opacity 2f. Under it, in its own frame, a
  window 40 by 30 of `AIR` at half size from (−42, −8), starting `40t` px along the picture,
  kept between 10 and 30 by steps of 20.

## Runway sand — confirmed

- Scheduled like ice (20 attempts, 40 s apart) and created by `0x6d4d0` at `runway+0xd4`.
  Class with vtable `0x17b548`; it plays `SOUNDS.SAND_APPEARS`. A runway under sand refuses
  every plane (`0x6da3a`), with hint 13 when the order was given by hand (12 for ice, 11 or 14
  for fog).
- States (`0x6f6dc`, `sand+0x20`), with a clock that runs from its creation and a fade:
  0, the fade rises by 1 a second to 1; 1, once the clock passes 2 s, either the anti-sand
  `0x70` (`airport+0xae`) is owned, a brush is created and it goes to 5, or the clock starts
  again and it goes to 2; 2, after 15 s the fade is set to 2 and it goes to 3; 3, the fade
  falls by 1 a second and below 1 the runway is freed (4); 4, it keeps falling and at 0 the
  sand is removed. Swept: 5, the fade falls by 0.2 a second and below 0.3 the runway is freed
  (6); 6, the same until 0. So a runway is closed 18 s without the brush and 5.5 s with it.
- Draw (`0x6f8e0`): six images `RUNWAY.SAND.n`, `n = (i + 2) mod 4`, at x −140 + 56·i and 2 px
  above the runway's position. With the fade below 1 each has opacity
  `clamp(4·fade − i/3 − 1, 0, 1)`. Sorted 4 px in front of the runway's line.
- Brush (`0x1a10c`, vtable `0x179798`, `SOUNDS.ANTI_SAND` played once): its progress rises by
  a quarter a second and it is removed at 1. Drawn (`0x1a4b0`) at x + 180 − 190·p and
  y − 25 + 20·a², with opacity `a = clamp(20·min(p, 1 − p), 0, 1)` and image `BRUSH.n`,
  `n = int(96·p) mod 8`, or 2 from p = 0.94. Sorted 5 px in front of the runway's line.
- Puffs (`0x1a230`): while p < 0.9 a timer that starts at 0.06 s runs down and each time it
  passes 0 a puff is made and 0.05 to 0.1 s added. A puff (`0x1a8ec`, `SAND_PUFF`) starts at
  the brush's x and 25 px above the runway plus half its speed; speed x −25 to −15 and y −20
  to −5, both negated half the time; acceleration y −20 to −10; angle −10° to 10° turning at
  −30 to 30°/s; size 0.5 to 0.8 growing by 0.6 a second; life 1 to 1.2 s; opacity
  `clamp(min(2·life, 5·(1 − life)), 0, 1)`. It moves by the speed at the middle of each step
  (`0x9f18`).

## Stage 6 ("Africa") — read with the emulated script (`0xd77ac`)

- Nine levels. Gates of descriptor types 12, 13 (improved) and 14 (improved again): A
  (350, 125), B (375, 175), C (404, 225) with `0x16`, `0x20` or `0x2a`, D (430, 275) with
  `0x17`, `0x21` or `0x2b`.
- Gas station type 6 at (245, 78), hangar type 4 at (135, 68) (type 9 with the improved hangar
  `0x50`) and luggage conveyor type 3 at (21, 98).
- Taxi nodes (270, 180), (290, 210), (310, 240), (360, 312), (375, 312), (355, 290).
- Three runways of type 4 from the start: (−5, 175), (20, 210), (45, 245). With the fourth
  runway `0x35`: (0, 170), (25, 200), (50, 230), (75, 260). With the VIP runway `0x3c` runway
  1 is of type 7.
- Stop spots, wash and go and painting stop spot as in stage 5.
- Backdrop: sky 70, `BACKGROUND_DOWN` at (0, 120) scaled 16×, clouds, `BACKGROUND_TOP` at
  (0, 40), `AIRPORT` at (370, 57). The neutral gate colour is (0.898, 0.592, 1).
- Offers in the order registered: `0x01` 50000 (try from level 4), `0x77` 320000, `0x02`
  75000 (6), `0x0a` 135000, `0x72` 320000, `0x16` 200000, `0x17` 210000, `0x1e` 160000,
  `0x1f` 170000, `0x20` 180000, `0x21` 190000, `0x28` 120000, `0x29` 130000, `0x2a` 140000,
  fourth runway `0x35` 250000, `0x3c` 150000, `0x50` 260000, `0x74` 170000, `0x73` 170000,
  anti-fog `0x6f` 170000, anti-sand `0x70` 230000 (6), licence `0xcf` 430000, `0x2b` 150000.
  When each is on sale follows the pattern confirmed for stages 1 to 3 and single-improvement
  runs.
- Bonus events: helicopter on level 2 (from the right, 63.3 s, coins of 2000) and level 7
  (from the left, 152.1 s, 2500), balloons on level 5 (108.5 s, 2500) and level 9 (101.9 s,
  3000).
- Fog and sand per level, from the levels database: none on levels 1 and 2; 1 and 1 on 3; 3
  and 2 on 4; 3 and 3 on 5 and 6; 4 and 6 on 7; 3 and 3 on 8; 5 and 3 on 9.
- Later stages have more levels than the first five: 10 in stage 7, 11 in stage 8, 12 in
  stage 9 and 13 in stage 10.

## Stage 7 ("Antarctic") — read with the emulated script (`0xd9e00`)

- Ten levels. Gates of descriptor types 15, 16 (improved) and 17 (improved again): A
  (345, 145), B (377, 190), C (409, 235) with `0x16`, `0x20` or `0x2a`, D (441, 280) with
  `0x17`, `0x21` or `0x2b`.
- Gas station type 7 at (48, 92), hangar type 5 at (163, 85) (type 10 with `0x50`) and luggage
  conveyor type 4 at (340, 87).
- Taxi nodes (225, 175), (252, 205), (279, 235), (306, 265), (345, 312), (360, 312),
  (345, 300), and a linked pair (`0x14808`) at (310, 160) and (330, 190). That builder makes
  both nodes terminal (third argument of `0x45ff4`, stored at `node+0xd`) and links them: no
  route can pass through a terminal node, so the pair only keeps the automatic links from
  crossing the line between them, beside the building.
- Runways of type 4: (−5, 180), (20, 210), (45, 240); with `0x35`, the same four as stage 6.
  VIP runway `0x3c` as before.
- Backdrop: no sky object. `BACKGROUND_BOTTOM_TOP` at (0, 0) scaled 16×3.5, `BACKGROUND_DOWN`
  at (0, 123) scaled 16×18, eight stars (`0x13b8c`), the aurora (`0x13808`), `BACKGROUND_TOP`
  at (0, 41), and the building `AIRPORT` at (365, 65) as an image with depth 120 (`0x1404c`).
  The neutral gate colour is (0.929, 0.647, 1).
- Offers in the order registered, none with a level to try it from: `0x01` 55000, `0x77`
  200000, `0x02` 80000, `0x0a` 165000, `0x72` 410000, `0x16` 210000, `0x17` 220000, `0x1e`
  170000, `0x1f` 180000, `0x20` 190000, `0x21` 200000, `0x28` 130000, `0x29` 140000, `0x2a`
  150000, `0x35` 525000, `0x3c` 380000, `0x50` 330000, `0x74` 200000, `0x73` 200000, anti-fog
  `0x6f` 170000, deicer `0x6e` 225000, licence `0xd0` 430000, `0x2b` 160000.
- Bonus events: helicopter on level 2 (from the right, 43.0 s, coins of 3000) and level 6
  (from the left, 70.7 s, 3500), balloons on level 4 (80.1 s, 3500) and level 9 (104.6 s,
  4000).
- Fog and ice per level, from the levels database: none on 1 and 2; 0 and 2 on 3; 1 and 1 on
  4; 1 and 3 on 5; 5 and 4 on 6; 2 and 3 on 7; 4 and 4 on 8; 3 and 5 on 9; 3 and 8 on 10.

## Stage 8 ("Carrier") — read with the emulated script (`0xdc5b8`)

- Eleven levels. Gates of descriptor types 18, 19 (improved) and 20 (improved again): A
  (348, 136), B (380, 182), C (408, 228), D (440, 274), with the same improvements as before.
- Gas station type 8 at (55, 97), or type 10 with the improved gas station `0x5a` (new here);
  hangar type 6 at (170, 75), or type 11 with `0x50`; luggage conveyor type 5 at (340, 86).
- Taxi nodes (225, 170), (250, 200), (275, 230), (300, 260), (335, 307), (355, 307),
  (345, 297), and a linked terminal pair at (312, 148) and (327, 169).
- Runways of type 5: (−5, 180), (20, 210), (45, 240); with `0x35`, (0, 170), (25, 200),
  (50, 230), (75, 260). VIP runway `0x3c` as before. Stop spots as in stage 5, with corner 0.
- Backdrop: sky 70, `BACKGROUND_DOWN` at (0, 115) scaled 16×19, `OCEAN_BOTTOM` at (0, 68)
  scaled 48×4, clouds, four islands (`0x14c3c`, `0x14d08`, `0x14dd4`, `0x14ea0`), `OCEAN_TOP`
  at (0, 45), the sea (`0x13c3c`), `BACKGROUND_TOP` at (0, 85) and `AIRPORT` at (359, 45) with
  depth 100. The neutral gate colour is (0.671, 0.804, 1).
- Offers in the order registered, none with a level to try it from: `0x01` 65000, `0x77`
  300000, `0x02` 100000, `0x0a` 195000, `0x72` 440000, `0x16` 240000, `0x17` 250000, `0x1e`
  190000, `0x1f` 200000, `0x20` 210000, `0x21` 220000, `0x28` 140000, `0x29` 150000, `0x2a`
  160000, `0x35` 690000, `0x3c` 410000, `0x50` 390000, `0x5a` 390000, `0x74` 220000, `0x73`
  220000, anti-fog 220000, deicer 250000, licence `0xd6` 530000, `0x2b` 170000.
- Bonus events: helicopter from the left on level 2 (65.3 s, coins of 4000) and level 8
  (148.9 s, 4500), balloons on level 6 (67.8 s, 4500) and level 11 (50.9 s, 5000).
- Fog and ice per level, from the levels database: none on 1 and 2; 0 and 2 on 3; 1 and 2 on
  4 and 5; 6 and 5 on 6; 3 and 5 on 7; 6 and 2 on 8; 1 and 5 on 9; 6 and 5 on 10; 5 and 7 on 11.

## Stage 9 ("Moon") — read with the emulated script (`0xdef50`)

- Twelve levels, with fog, ice and sand together and no bonus events (the script makes no
  balloons and no helicopter on any level).
- Gates of descriptor types 21, 22 (improved) and 23 (improved again): A (345, 150), B
  (380, 190), C (415, 230), D (450, 270).
- Gas station type 9 at (35, 110), or 11 with `0x5a`; hangar type 7 at (120, 95), or 12 with
  `0x50`; luggage conveyor type 6 at (343, 90), or 7 with the improved luggage `0x64` (new).
- Taxi nodes (205, 160), (235, 190), (265, 220), (295, 250), (250, 156), (240, 140),
  (365, 300), (375, 315), (355, 315); no linked pair.
- Runways of type 6: (−5, 195), (20, 230), (45, 265); with `0x35`, (0, 180), (25, 210),
  (50, 240), (75, 270). Stop spots as before, with corner 1.
- Space gas: the script ends with `0x12f90(airport, 1, …)`, which sets `airport+0x7c`, and
  passes "owns `0x71`" (anti space gas) where the other stages pass "owns `0x6f`". With the
  flag the fog is drawn in the colour (0.624, 1, 0.686) (`0x3a672`) and the hint is 14 instead
  of 11.
- Backdrop: no sky object but a backdrop of space (`0x136a8`, class at `0x664fc`): `SPACE`
  drawn at four times its size, then about 119 `AMBIENT.STAR` and five bodies (`EARTH`,
  `GALAXY_0`, `NEBULA`, `SATURN`, `GALAXY_1`) drifting by (−620, −100) every 333 s and
  wrapping (`0x665d4`). Then `BACKGROUND_DOWN` at (0, 173) scaled 16×19, `BACKGROUND_TOP` at
  (0, 45) and `AIRPORT` at (327, 45) with depth 100. The neutral gate colour is
  (0.902, 0.933, 1).
- Offers in the order registered: `0x01` 95000 (try from level 2), `0x77` 610000, `0x02`
  140000, `0x0a` 280000, `0x72` 610000, `0x16` 285000, `0x17` 315000, `0x1e` 260000, `0x1f`
  290000, `0x20` 300000, `0x21` 310000, `0x28` 250000, `0x29` 260000, `0x2a` 260000, `0x35`
  570000, `0x3c` 620000, `0x50` 565000, `0x5a` 565000, `0x64` 565000, `0x74` 305000, `0x73`
  305000, anti space gas `0x71` 305000, deicer 455000, anti-sand 410000, licence `0xda`
  920000, `0x2b` 270000.

## Stage 10 ("Mars") — read with the emulated script (`0xe18c4`)

- Thirteen levels, with space gas, ice and sand and no bonus events.
- Gates of descriptor types 25, 26 (improved) and 27 (improved again): A (333, 125), B
  (370, 170), C (407, 215), D (444, 260).
- Gas station type 13 at (143, 97), or 14 with `0x5a`; hangar type 14 at (238, 80), or 15 with
  `0x50`; luggage conveyor type 8 at (50, 93), or 9 with `0x64`.
- Taxi nodes (220, 165), (240, 190), (260, 215), (280, 240), (300, 265), (345, 300),
  (355, 315), (335, 315); no linked pair.
- Runways of type 6: (20, 185), (45, 220), (70, 255); with `0x35`, (15, 175), (35, 205),
  (55, 235), (75, 265). The VIP runway `0x3c` makes runway 1 of type 9 here, not 7. Stop spots
  as before, with corner 1. Space gas as on the Moon.
- Backdrop: no sky object but a sky of its own (`0x13758`, class "MarsSky" at `0xcbffc`): the
  image `SKY` over a grid of 30 by 20 points, 480 px wide and as high as the script says (70)
  (`0xcbea4`), whose texture coordinates ripple with time (`0xcc0bc`). Then `BACKGROUND_TOP`
  at (0, 51); eight pieces of ground at y 130, scaled (±1, 2): `BACKGROUND_DOWN_1` at x 0,
  `_2` at 62, `_1` mirrored at 186, `_2` mirrored at 248, `_1` at 248, `_2` at 310, `_1`
  mirrored at 434, `_2` mirrored at 496; `TOWER` at (300, 10) and `AIRPORT` at (347, 65), both
  plain images. The neutral gate colour is (0.902, 0.933, 1).
- Offers in the order registered, none with a level to try it from: `0x01` 95000, `0x77`
  310000, `0x02` 140000, `0x0a` 280000, `0x72` 610000, `0x16` 330000, `0x17` 340000, `0x1e`
  280000, `0x1f` 290000, `0x20` 300000, `0x21` 310000, `0x28` 230000, `0x29` 240000, `0x2a`
  250000, `0x35` 570000, `0x3c` 410000, `0x50` 500000, `0x5a` 500000, `0x64` 500000, `0x74`
  305000, `0x73` 305000, anti space gas `0x71` 355000, deicer 425000, anti-sand 510000,
  licence `0xdb` 720000, `0x2b` 260000.

## Tutorial ("Airport Academy", stage 0) — confirmed

### Layout (script `0xcde40`, three days)

- Gates of descriptor type 24 at (320, 133) and (400, 133); one runway of type 1, created with
  flag 0, at (95, 205); a stop spot at (330, 290); a taxi node at (4, 240). On the third day
  only: gas station type 12 at (185, 125), hangar type 13 at (45, 118), luggage conveyor type
  0 at (464, 245). Every place is given balloon corner 0, the gates, the pump and the hangar
  included.
- Backdrop: sky 60, clouds, `BACKGROUND_TOP` at (0, 38), the sea (`0x13c3c`),
  `BACKGROUND_DOWN` at (0, 158) scaled 16×17, and a flag at (245, 56) (`0x1503c`, class
  `0x39474`, `STAGES.TUTORIAL.FLAG`). The neutral gate colour is (0.769, 0.6, 1). Nothing is
  on sale.

### The tutorial object

- Level state 1 (`0x116a6`) makes it with `0x7ad18(day)` and keeps it at `level+0x128`; other
  stages have none. Classes: RealTutorial (vtable `0x17b9e8`), BasicSequenceTutorial
  (`0x17ba68`, day 1), CombosTutorial (`0x17bae8`, day 2), ExtrasTutorial (`0x17bb68`, day 3).
- Goals: a vector at `+0x28`, 72 bytes each, with the state at `goal+0x20` (0 pending, 1 done,
  2 failed), a clock at `+0x24` that the update (`0x7b45c`) advances by two a second, and for
  the goals that count how many of two are done at `+0x28` (set by `0x7a92c`).
- When the level ends (`0x11d36`): slot 9 (`0x7b4a4`) fails every goal still pending, slot 10
  (`0x7b4d0`) says whether all are done, and the day is failed anyway if the score
  (`level+0x158`, copied from `+0x1b4`) is not above zero. Then the report `0x7efb4`.
- Events, by vtable slot and where the game calls it: 11 a plane appears (`0x5990`), 12 a
  plane is selected (`0x5e6c`), 14 loading starts (`0x62cc`), 15 loading ends (`0x630c`), 16
  unloading starts (`0x6378`, with the gate), 17 unloading ends (`0x64ac`), then, if the plane
  has no order waiting, 19, 20 or 21 for a need of repair, fuel or luggage (`0x6566`), 22
  repaired (`0x6698`), 23 fuelled (`0x6748`), 24 luggage loaded (`0x6820`), 25 a landing
  begins (`0x7446`), 26 landed (`0x840a`, with the runway), 27 take-off (`0x626c`, with the
  runway).
- Day 1 (four goals: land, unload, load, take off): three seconds after a plane appears with
  none selected, hint `PLANE` / `NEED_TO_SELECT` (`0x7b600`); selecting a plane still in the
  air, `RUNWAY` / `TUTORIAL_SELECTED`; landed, `GATE_<stage>` / `TUTORIAL_FINISHED_LANDING`
  and goal 1; unloading starts, `UNLOADING` / `TUTORIAL_START_UNLOADING` and goal 2; unloading
  ends, `LOADING` / `TUTORIAL_FINISHED_UNLOADING`; loading starts, goal 3; loading ends,
  `RUNWAY` / `TUTORIAL_FINISHED_LOADING`; take-off, goal 4.
- Day 2 (a runway combo; the same colour at the gates twice): it counts landings and
  take-offs. The first landing gives `TUTORIAL_LANDING_COMBO` / `…TO_GET_A_LANDING_COMBO`; a
  later one with the runway's landing count (`+0x9c`) at 2 or more gives `…_X2` /
  `…TO_GET_ANOTHER…` and goal 1. Take-offs likewise with `+0xa0`; after two take-offs with no
  combo of either kind goal 1 fails (`0x7b9b0`). When unloading starts (`0x7b874`) it compares
  the gate's colour before this plane (`gate+0xbc`, copied from `+0xc0` on arrival) with the
  colour now (`+0xc0`): different, and the gate had one, fails goal 2; the same with the count
  (`+0xc4`) at 2 counts one towards it, with `TUTORIAL_GATE_COMBO_X2` /
  `…YOU_MADE_A_GATE_COMBO` the first time. Slot 25 (`0x7b8f8`) counts orange planes coming in
  to land and tells about the orange gate at the second; the day's planes are blue and green.
- Day 3 (repair, refuel, luggage, two planes each): each need is explained once
  (`HANGAR_0` / `NEED_TO_BE_REPAIRED`, `GAS_STATION_0` / `NEED_TO_BE_FUELED`, `LUGGAGE_0` /
  `NEED_TO_BE_LOADED_WITH_LUGGAGE`) and each service done counts one towards its goal.

### Hints (`0x4aedc(manager, picture, text key)`)

- Used by the whole game, not only the tutorial (the runway hazards call it through
  `0x10890`). It clears what the manager shows, makes a 400×200 frame, the picture
  `HINTS.<name>` at (−160, −30) (a name with `%d` takes the stage number), the text in
  `FONTS.WHITE` in the box (−104, −80)–(200, 40), a Close button at (0, 80) 380 wide, and
  pauses the game (`0x108f0`). A new hint replaces one still up.

### Hints for refused orders (`0x10890(level, plane, id)`)

- Table at `0x1796a8`, picture and text key by id: 0 `PLANE` / `NEEDS_TO_SELECT`, 1 `RUNWAY` /
  `NEED_TO_BE_LANDED`, 2 `GATE_%d` / `NEED_TO_BE_UNLOADED`, 3 `HANGAR_%d` /
  `NEED_TO_BE_REPAIRED`, 4 `GAS_STATION_%d` / `NEED_TO_BE_FUELED`, 5 `WASH_AND_GO` /
  `NEED_TO_BE_WASHED`, 6 `LUGGAGE_%d` / `NEED_TO_BE_LOADED_WITH_LUGGAGE`, 7 `GATE_%d` /
  `NEED_TO_BE_LOADED`, 8 `RUNWAY` / `NEED_TO_BE_LAUNCHED`, 9 `GAS_STATION_%d` /
  `THERE_ISNT_GAS_STATION`, 10 `HANGAR_%d` / `THERE_ISNT_HANGAR`, 11 `FOG`, 12 `ICE`, 13
  `SAND`, 14 `SPACE_GAS`.
- A counter per id at `level+0x170 + 4·id`: above zero it is counted down and nothing is
  shown. Otherwise, if the plane is the selected one (`level+0x118`), the hint is shown and
  the counter set to the game's `+0x14` kept between 3 and 5.
- Raised by the routines that say whether a plane may go to a place now (slot 15, with the
  order given by hand), through one helper per thing done (`0x6b3fc` landed → 1, `0x6b428`
  unloaded → 2, `0x6b454` serviced → 3, `0x6b4ac` fuelled → 4, `0x6b480` luggage → 6,
  `0x6b4d8` loaded → 7, `0x6b504` taken off → 8). The first missing in the place's order is
  the hint:
  - gate (`0x43530`): landed; then, once unloaded, fuelled, serviced, luggage; once loaded, 8.
  - gas station (`0x40d4c`): landed, unloaded, serviced; once fuelled, luggage, loaded, 8.
  - hangar (`0x4735c`): landed, unloaded; once serviced, fuelled, luggage, loaded, 8.
  - luggage (`0x56c18`): landed, unloaded, serviced, fuelled; once it has it, loaded, 8.
  - runway (`0x6da34`): sand 13, ice 12, fog 11 or 14 first; a landed plane then needs
    unloaded, serviced, fuelled, luggage, loaded.
  - stop spot, wash and go, painting stop spot (`0x797a8`, `0x85290`, `0x67dd8`): landed.
- Web version: which value the game's `+0x14` holds has not been read, so three occasions pass
  in silence. Hints 0, 5, 9 and 10 are in the table but nothing raises them: `0x10890` is only
  called with 1 to 8 (the helpers above) and, by the runway (`0x6da94`), with its hazard's.

### Dialogs and the goals panel

- Text boxes (`0x2d14c`) take a rectangle as left, top, right, bottom from the dialog's
  centre. Cached fonts: `FONTS.MAIN` is Brady Bunch at 14 with a gold effect, `FONTS.ULTRA`
  Blue Stone at 20 and 0.8 of its width, `FONTS.WHITE` Teen Bold at 11, `FONTS.TEEN` Teen Bold
  at 10 and 0.9 of its width.
- Day's opening (`0x7d650`): 400×250; title `LEVEL<n>.TITLE` in `FONTS.MAIN` in
  (−187, −110)–(187, −80); a rule at y −80, 381 wide; `LEVEL<n>.TEXT` in `FONTS.WHITE` in
  (−187, −65)–(187, 80); Main Menu at (−100, 105) and Continue at (100, 105), 160 wide.
- Goals (`0x7dfe0`): 400×250; `GOAL_TITLE` with the day in (−187, −110)–(187, −80); a rule at
  y −85, 345 wide; `TO_PASS` in (−172, −70)–(172, −60); `LEVEL<n>.GOAL` in
  (−170, −50)–(200, 60); Continue at (0, 105), 260 wide. Closing it shows the goals panel
  (slot 8, `0x7b49c`).
- Report (`0x7efb4`): `MUSICS.` and `SOUNDS.FINAL_REPORT.SUPREME` or `.FAIL`; 400×250 over
  `GUI.FINAL_REPORT.BACK_STAR` or `SPIRAL` at 390×240; a rule at y −85, 380 wide;
  `TUTORIAL_REPORT.SUCCESS` or `FAILED` in `FONTS.ULTRA` in (−150, −110)–(150, −80);
  `LEVEL<n>.SUCCESS` or `FAILED` in (−185, −70)–(185, 60); Continue at (0, 105), or Try again
  at (0, 50) and Main Menu at (0, 105), all 380 wide.
- Goals panel (draw `0x7b2cc`): its top is at y `350 − (height + 40)·f²`, `f` rising three a
  second while shown and falling five a second otherwise (`0x7bec4`). `GUI.TUTORIAL_BACK_TOP`
  stretched nine times across from x `width − 9·w + 5`, `…_CORNER` after it, `…_RIGHT`
  stretched three times down under the corner, `…_COLOR` filling the rest, and
  `GUI.TUTORIAL_FASTENER` at (36, −16). Rows start 10 px down. Adding a goal (`0x7cdc4`) puts
  it at x 12 and y `height + 12`, adds 22 to the height and keeps the widest row (text width
  + 20). A row (`0x7aac0`) draws `GUI.GOAL_CHECKBOX`, then, done or failed, `INDICATORS.YES`
  or `INDICATORS.NO` 6 px lower at 0.45 of its size, popping in over a second as
  `(1 + sin(4π·t))·t·(1 − t) + t`, and its text 12 px to the right in black `FONTS.TEEN`.
- Web version: the rules are drawn as a plain line;
  whether the game records the tutorial as done, what the map's Tutorial button asks first
  (`TUTORIAL_QUESTION_DIALOG`, `0x7e590`) and which dialog leads to which have not been read:
  the opening is followed by the goals, and passing a day leads to the next, the last to the
  map.

## Animated scenery — confirmed

The stage scripts make these between their backdrop images; the web version keeps both in one
list in that order (`backdrop.layers`) and makes a view for each piece
(`src/game/view/scenery/`).

Backdrop images and scenery are added to a list of the airport's own (`airport+8`, by
`0xa3490(airport + 8, object)`), drawn in the order they were made. Places, planes and images
with a depth go to another (`airport+0x14`), sorted by depth. When the stage script ends
(`0x12fba`) that second list is sorted and added to the first as one more item (`0x12fce`). So
everything the script made as scenery, even after the places, is drawn under every runway,
place and plane; only what is added later (the service tabs) lies over them.

- Flag (`0x1503c` → class `0x39484`, draw `0x39558`): its image, sheared by
  `0.05·sin(2π·frac(0.2·t))`, at its position. The tutorial has `STAGES.TUTORIAL.FLAG` at
  (245, 56).
- Horizon object (class `HorizonObject`, constructor `0x4b278(loop, speed, start, y, image)`,
  update `0x4b384`, draw `0x4b3d0`): a clock that starts at `start` and wraps at `loop`; x is
  `speed·(loop − clock) − 100`; drawn only for −40 < x < 520, turned by `3·(x/120 − 1)` degrees
  at (x, `y + 7·|x/240 − 1|`). The carrier's four islands (`0x14c3c`, `0x14d08`, `0x14dd4`,
  `0x14ea0`; `STAGES.CARRIER.ISLANDS.0`…`3`) have loop 400, speed 8, starts 100, 200, 300 and
  400 and y 37, 38, 41 and 37.

- Star (`0x13b8c(position, size)` → class `0x292bc`, draw `0x293e4`): `AMBIENT.STAR`, drawn
  additively, stretched to `size·(0.8 + 0.2·sin(4·(phase + t)))` px across, with a phase picked
  at random between 0 and π. The Antarctic has eight: (15, 13) 9, (56, 40) 9, (117, 45) 7,
  (144, 20) 8, (156, 25) 11, (313, 9) 9, (419, 25) 6, (458, 35) 7. The monsters' stage has six:
  (26, 55) 9, (93, 33) 9, (195, 38) 7, (240, 17) 8, (260, 61) 11, (323, 34) 9.
- Aurora (`0x13808` → class `0x74f44`, draw `0x7505c` then `0x75098`):
  `STAGES.ANTARCTIC.AURORA_BOREALIS`, additive, over a strip of 75 pairs of points drawn at
  half size from (10, −2). With `τ = t mod 495`, `k = 0.02π·τ` and `i = 0, 2, … 148`:
  `a = sin(5k + 0.17i + 3)`, `b = sin(−11k + 0.27i + 5)`, `c = sin(9k + 0.23i + 4)`;
  `x = 800·i/148 + 1.6c − 1.1b`; `n = (x − 400)/400`; the top point is at `80n² − 20` and the
  bottom one at `120 − 60n² + (2c + 2.5b + 3a)·(1 − 0.8n²)`. The image runs along the strip
  (`u = i/148`, top edge above, bottom edge below; `0x75024`).

- Moving image (`0x14b5c(x, y, loop, span, speed, offset, image)` → class `MovingImage`
  `0x7232c`, draw `0x72440`): a clock `frac(t / loop)·loop + offset`, less `floor(loop)` once
  it is past `loop`; x is `x + speed·clock`; drawn while −200 < x < 1000 and the clock is below
  `span`. The sky's clouds are six of these (`0xcda08`: x −100, loop `2·1300/speed`, span half
  of it). The Airborne stage has four mountain tops, all from x 500:
  `MOUNTAINS.0` y 81, loop 250, span 45, speed −6.5, offset 50; `.1` the same with offset 175;
  `.2` y 90, loop 150, span 33, speed −9, offset 25; `.3` y 92, loop 150, span 21, speed −16,
  offset 100. They are made before `BACKGROUND_TOP`, which covers where they stop.
- Band of cloud (`0x14858(index, period, y, left, right)` → class `0x71e50`, draw `0x72038`):
  `STAGES.AIRBORNE.CLOUDS.<index>`, 240 px wide, drawn three times side by side from
  `left − slide`, the first cut off at `left`, with `slide = frac(t / period)·240`, at
  `y + (24 / period)·5·(1 + sin(0.2·t))`. Five bands: period 50 y 82, 30 y 85 and 20 y 89 from
  left 270; 12 y 96 from 300; 12 y 106 from 400; right 480 for all.
- Propeller (`0x14928(position, scale)` → class `0x3418`, draw `0x34f8`):
  `STAGES.AIRBORNE.PROPELLER` turned by `360·frac(10·t)` degrees, then scaled, at its
  position: (89, 65) scaled (0.4, 1) and (274, 76) scaled (0.6, 1.4).

- Scary cloud (`0x14aa8(index, position, speed)` → class `0x70098`, draw `0x70164`):
  `STAGES.MONSTERS.SCARY_CLOUD_<index>`. With `f = frac(t·speed / 1190)`, x is
  `x + 1190·f`, brought back into −300…880 in steps of 1180, and it is scaled by
  (`1 + 0.04·sin(200f)`, `1 + 0.06·cos(200f)`). Four: index 1 at (100, 19.5) speed 15, 3 at
  (700, 33) speed −12, 2 at (400, 30) speed −8, 0 at (1000, 48) speed 9.5. The witch crosses
  between the second and the third: a moving image, `STAGES.MONSTERS.WITCH` from x 900 at y 40,
  loop 100, span 12, speed −80, offset 67.456.
- Patch of fog (`0x149d4(position, image, mirrored, loop, span, speed, start)` → class
  `0x70580`, update `0x70668`, draw `0x7069c`): a clock from `start` that wraps at `loop`;
  drawn while it is below `span`, at x + clock·speed, mirrored if asked, with opacity
  `min(clock, span − clock)/2` kept within 0 and 1. Five by the gas station, made after the
  buildings: `FOG_2` at (60, 94) mirrored, 19, 13, −2.5, 3; `FOG_1` at (70, 105), 17, 14, 3,
  0; `FOG_0` at (35, 98), 16.3, 8, −4.1, 1.7; `FOG_1` at (96, 93) mirrored, 16.3, 8, 3.3, 10.7;
  `FOG_2` at (43, 100), 19, 14, 3.5, 7.
- Bat (`0x14f6c(position, loop, span, start, phase)` → class `0x2275c`, update `0x22834`,
  draw `0x22868`): a clock from `start` that wraps at `loop`; drawn while it is below `span`.
  With `c = π·clock` it is at position +
  (`10·sin(2c + phase) − 150·sin(0.3c)`,
  `1.1·(cos 2c + cos(11c + 0.13) + cos(20c + 0.15)) − 120·cos(0.3c)`), showing image
  `STAGES.MONSTERS.BAT.<n>`, `n = int(6·frac(2t) + phase) mod 6`. Five, made after the places,
  all with loop 25 and span 10 and y 190: x 520 start 0 phase 15; 510, 0.37, 5; 540, 10.1, 7;
  540, 11.1, 0; 530, 1.27, 11.

- Santa's sleigh (`0x13f84(position, loop, speed, offset)` → class `0x397f4`, draw
  `0x398c8`): a clock as the moving image's; the rear is at `x + speed·clock`, drawn while
  that is between −200 and 1000. Six pieces 18 px apart, `STAGES.NORTH_POLE.SANTA` at the rear
  and five `REINDEER` ahead; piece `i` is at
  `y + 3·sin(2π·(0.2·clock + 0.1·i)) − 20·cos(π·(x_i − 400)/600)` and turned to the direction
  from the piece behind it (`0x9f90`, in degrees), the rear one by half the angle of the next.
  The North Pole has it at (−100, 50) with loop 380 and speed 50; the offset comes from the
  level's random numbers: 4.584, 9.534, 3.647, 3.377, 4.032, 9.380, 7.047 and 6.642 on levels
  1 to 8.
- Snow (`0x13d0c(top, bottom, image, drift, fall, interval)` → class `0x765d8`, update
  `0x76748`, draw `0x76a5c`). A flake is made each time a timer runs out and
  `(0.5…1)·interval` is added to it: at x −20…500 and y `top`, falling at `fall`, with a
  sideways speed within ±`drift`, an angle of 0…360°, a spin within ±60°/s and a size of
  0.75…1. Every 0.3…0.6 s it gets a new sideways push within ±`drift/2` and a new push on its
  spin within ±60°/s². It is removed at `bottom` and drawn with opacity
  `clamp(10·min(u, 1 − u))`, `u` being how far down it is. Five on the North Pole's overcast
  levels, all from y 30: `SNOW_FLAKES.4` to 150 (5, 10, 0.2), `.3` to 180 (5, 15, 0.25), `.2`
  to 280 (10, 25, 0.5), `.1` to 320 (20, 50, 4), `.0` to 320 (40, 100, 15).
- The North Pole's script makes a different backdrop on odd levels: instead of the sky
  object, `STAGES.NORTH_POLE.COVERED_SKY` at (0, 0) scaled 16×23, and the five falls of snow.
  The clouds and the sleigh are made on every level.

- Space (`0x136a8(height)` → class `0x664fc`, set up by `0x65f88`, drawn by `0x665d4`), the
  Moon's sky, with height 70. `STAGES.MOON.SPACE` at four times its size, then 150 stars and
  five bodies. With `f = frac(0.003·t)`, everything is drawn at (x − 100·f, y − 620·f), put
  back by (+100, +620) once y is under `height − 620`.
  - Stars come from a generator of their own (WELL512, `0x36fd4`), seeded with
    `0x1234567 + height` added as floats: state word 0 is `seed ^ 0x75bcd15` and word k is
    word k−1 `^ (seed << k)`. Each star takes four numbers in turn: x in −50…500, y in 0…600,
    size in 0.2…0.3 and a phase in 0…2π. It is `AMBIENT.STAR` scaled by
    `size·(0.8 + 0.2·sin(300π·f + phase))`, drawn while −30 < y < height + 30 and
    −30 < x < 500.
  - Bodies, as field position, reach and turn in degrees: `EARTH` (46, 108) 90, 0;
    `GALAXY_0` (100, 192) 150, −47; `NEBULA` (330, 300) 150, 300; `SATURN` (241, 420) 80, 225;
    `GALAXY_1` (450, 540) 150, 120. Each is drawn while −reach < y < height + reach.
  - Web version: the generator's index is read from a word the constructor never sets; it is
    taken to start at 0, so the stars may not be where the original's are.

- Sky of Mars (`0x13758(height)` → class "MarsSky" `0xcbffc`, grid `0xcbea4`, draw
  `0xcc0bc`), with height 70: `STAGES.MARS.SKY` over a grid of 30 columns by 20 rows of points
  at (`480·column/29`, `height·row/19`), drawn as one mesh. Only the texture coordinates
  change. With `f = frac(0.004·t)`, `g = f` up to a half and `f − 0.5` after, and `w = 20π·f`,
  point (row i, column j) shows
  `u = g + 0.5·(j + 1 + 0.07·(0.1·sin(3w + 0.37i + 0.22j + 17) + 0.4·sin(9w + 0.3i + 0.52j + 10) + 0.4·sin(18w + 0.15j + 0.56i)))/31`,
  `v = (i + 1 + 0.3·(0.5·sin(7w + 0.2i + 0.62j + 16) + 0.2·sin(4w + 0.6i + 0.32j + 49) + 0.2·sin(17w + 0.13j + 0.46i + 3)))/21`.
  So half the image's width is shown, sliding along it and stepping back half way through
  each 250 s.

## Drawing order of the airport's objects — confirmed

- Every object of the airport is kept in one list (`airport+0x14`, added by `0xa3490`), which
  the airport's update sorts by the float at `object+4` after updating them (`0x1238c` calling
  the list sort `0x179a8`, merge `0x17bb0`). The sort is stable, so objects at the same depth
  stay in the order they were created.
- A gate's depth is its y plus its descriptor's `DespZ` (`0x43094`); `DespZ` is 0 for every
  type but 3 (−10). The plane docked at a gate stands 22 to 63 px lower (`NodePosition`), so
  it is drawn over the gate; one passing above the gate goes under it.
- Other depths read so far: fog and sand `runway.y + 4`, the anti-sand brush `runway.y + 5`,
  a sand puff the y it appeared at, the painting sign `spot.y − 15`, an image made by `0x1404c`
  the depth it is given (600 for the arch of Arches, 120 for the Antarctic building).
- Web version: planes, gates and the objects above are sorted this way. The hangar, gas
  station, luggage conveyor, stop spots and runways are still drawn in fixed layers under the
  planes; their depths have not been read.

- Depths set by the places' constructors (`object+4`):
  - runway (`0x6d0c6`) and stop spot (`0x78f66`): y − 1000, so under everything sorted;
  - gate (`0x43094`): y + `DespZ`; luggage conveyor (`0x567a4`): y + `DespZ`;
  - gas station (`0x40924`): y + its node's y + `Z` (−20 in every descriptor);
  - hangar (`0x46d50`): y + its node's y + `DespZ`, with its back half a static image of its
    own 50 behind that (`0x46e12`), so a plane inside is drawn between the two.
- A plane being serviced stays on the hangar's node (`0x47234` moves nothing), which is at the
  front half's depth; the web version draws it just behind that half.

## Stage 3: what is still approximate

- Fog: the machine's wobble.
- The balloon corner of its runways is taken to be the island's.
- Everything listed for stages 1 and 2 below applies here too.

## The stage scripts' own builders

Every script runs to the end in `tools/re/stage_layout.py`, so their layouts, offers and bonus
events can be read the same way. Builders not yet named, by script:

| Stage | Script | Scenery set | New builders |
|---|---|---|---|
| 4 | `0xd2958` | North Pole | `0x13d0c` ×5 (snow or smoke), `0x13f84` (flying Santa), `0x14738` (luggage) |
| 5 | `0xd4f54` | Airborne | `0x14858` ×5 (scrolling clouds), `0x14928` ×2 (propellers), `0x14b5c` ×4 |
| 6 | `0xd77ac` | Africa | none beyond `0x14738` (built, see above) |
| 7 | `0xd9e00` | Antarctic | `0x13808` (aurora), stars (built, see above) |
| 8 | `0xdc5b8` | Carrier | `0x13c3c` (sea), `0x14c3c`, `0x14d08`, `0x14dd4`, `0x14ea0` (built, see above) |
| 9 | `0xdef50` | Moon | `0x136a8` (space backdrop; built, see above) |
| 10 | `0xe18c4` | Mars | `0x13758` (its own sky; built, see above) |

`0x14738` (luggage) is in every script from stage 4 on. The levels database also gives later
levels ice and sand on the runways (kinds 1 and 2 of the same schedule as fog, created by
`0x6d41c` and `0x6d4d0`), and the hints mention sand and "space gas".

## Stages 1 and 2: what is still approximate

Everything else in these two stages is read from the binary and noted above with its address.
This is what is not, as of the fifth milestone.

Rules:

- The profile's factor at `+0x48` (it scales the level clock and the energy drain) is taken
  as 1.
- The loop bounds of the two runway ring loops (seven nodes each is assumed from the tables).
- Plane state 10 (set from `0x56b78`) is unknown; it has not been seen to matter here.
- The service tab acts when the finger goes down, not when it is lifted.
- The stage options `0x6e`–`0x70` are not understood.

Drawing:

- Planes: the mark on planes a service tab would reach is not drawn.
- Gate: the hover label; the first part of its draw routine has not been read. Order flag
  offsets are assumed.
- The font effects (gradients), the
  shop's item list layout (`0x4ca54`), the interiors of the map dialogs, how the level
  announcement is dismissed and what a level "introduces".
- Turning direction of the paint chooser's ring and of the spray can; the clock that blinks
  the time-over light; whether the airport darkens at night.

Checked end to end by `tools/dev/play-all.mjs`, which plays the thirteen levels in order and
verifies that each can be passed and that funds, stars and the opening of stage 2 chain.

## Credits — confirmed

- Dialog (`0x28f40`): 438×280, the roll at (0, −25) from its centre and Close, 380 wide, at
  (0, 120). The roll is made by `0x28a18(position, speed 40, delay 0, touchable 1)`.
- Layout (`0x27bc8`), from `CREDITS_DIALOG.TEXT`, one `#MARK#value#` per line. Cursor starts at
  30, interlining at 30, font `FONTS.MAIN`, colour white.
  - `FONT` and `INTERLINING` set what follows; `SEPARATION` adds to the cursor; `COLOR` takes
    four values divided by 255.
  - `LINE`: y = cursor, height = the font's (`font+36`); cursor += height + interlining.
  - `TWO_COLUMNS_LINE`: the same, its two texts centred 110 px either side (`+0x20` = 220,
    draw `0x28c04`), tops at y (text draw `0x94650`: r3 0/1/2 = left/centre/right, stack
    argument 0 = top at y, 1 = middle, 3 = bottom).
  - `IMAGE`: y = cursor + height div 2, cursor += height (no interlining).
  - `IMAGE_LINE`: a picture with text 20 px to its right (`0x28cf8`).
  - The roll's length is the final cursor less the interlining.
  - Every language's text uses only `FONT` (`FONTS.WHITE`), `LINE`, `IMAGE`, `SEPARATION`,
    `INTERLINING` and `TWO_COLUMNS_LINE`.
- Update (`0x2864c`), states 1 appear, 2 shown, 3 leave. Appearing, a clock rises to 0.5 s;
  leaving, it falls. Shown, the touch is polled: on its start the roll's speed and drag speed
  are zeroed; while held the roll moves by how far the finger rose and the drag speed becomes
  `v·k + (moved/dt)·(1 − k)` with `k = pow(0.3, dt)`; let go, the speed becomes the drag speed.
  Then always: `room = total + 10 − offset` going on, `offset + 10` going back;
  `offset += min(1, room/200)·dt·speed`, kept within 0 and the total.
- Draw (`0x2885c`): the whole roll's opacity is the clock while appearing or leaving (so it
  reaches a half and then is full). Per item `p = y − offset + 135`, opacity
  `clamp((min(p, 265 − p) − height/2)/50)`.
- Web version: the font's height is taken to be its cached size (11); `COLOR` and `IMAGE_LINE`
  are not built, no text using them; the dialog goes at once on Close instead of fading.

## Help — confirmed

- The game makes eight help dialogs at start (`0x3d76e`: `0x49c24(dialog, page)` for pages 1
  to 8, kept at `app+0x188`); the in-game menu's Help opens the first (`0x67654`). Each is
  built on opening by `0x49c80`: a 400×250 frame.
- Pages 1 to 7: a picture at (−150, −70) and `HELP_DIALOG.<page>.1` in
  (−100, −110)–(190, −10); a picture at (148, 30) and `HELP_DIALOG.<page>.2` in
  (−190, −18)–(94, 98); both texts `FONTS.WHITE`, set as the hint dialog's. The pictures are
  from the table at `0x17a9c4`: PLANE/RUNWAY, TELLING/WAITING, GATE_%d/GAS_STATION_%d,
  GATE_COMBO/RUNWAY_COMBO, DIRTY_PLANES/RUNWAY, STORAGE_PLACE/QUEUING,
  SWAPPING_PLACES/HIGHER_SCORES; `%d` is `0x827a8()+0x1c`.
- Page 8: `HELP_DIALOG.TIPS` in (−190, −110)–(190, −80); the tips shower (`0x4abf4` →
  `0x79e98`) at (0, 5), 400 wide; Next (`HELP_DIALOG.NEXT_TIP_SHORT`, `0x4a97c`) 85 wide at
  (150, 110), which shows the tip after (`0x49c54`: index + 1, back to 0 at the count).
- Bottom row, y 110: from page 2 a button 40 wide at −150 with `GUI.DIALOGS.ARROW` on it;
  Close (`0x4a4cc`) 100 wide at 0, which closes the help and opens the in-game menu again
  (`0x4a738`); up to page 7 a button at 150 with the arrow mirrored. Each arrow closes the
  dialog and opens the page before or after.
- Tips shower: `GUI.TIPS_SHOWER.SURFACE` drawn at x = −(width − 120)/2 = −140 and the tips
  60 px right of the shower (draw `0x7a0e0`). A tip (`0x7a188`) is `GAME_TIP.<n>` in
  `FONTS.TEEN` at 0.8, wrapped to (width − 120) − 68 = 212 (`0x25218`), on
  `GUI.TIPS_SHOWER.SPEECH_BUBBLE` stretched (`0xe4704`, cuts 34 and 23) to 280 wide and the
  text's height + 23, from (−140, floor(−height/2 − 11)); the text is drawn 34 px in from the
  bubble's left, centred on the tip's height (draw `0x7a72c`). The shower and each tip fade
  (`+0x20`, `+0x1c`), and a tip grows from half its height as it appears.
- Web version: `%d` is taken to be the stage, as for the hints; the tip's text is drawn
  black (its colour call `0xb4290` is not read); tips change at once, without the fade; the
  four numbers of the bubble's cut are taken as 34 from the left and 23 from the top.

## Users — confirmed

- The users are a list kept in `users.dat` (`0x8210c`, `0x82830`), each with a profile of
  their own; `0x827a8` gives the current one.
- Users dialog (`0x80cd8`): 340×250. List box `0x2f0e8(x −80, y −30, width 160, rows 3)`; New
  (`0x81778`) at (100, −90), Rename (`0x814dc`) at (100, −30) and Delete (`0x81240`) at
  (100, 30), each 120 wide; Load Profile (`0x80fa0`) 320 wide at (0, 100). The title string
  is not referenced.
  - The list is filled with every user's name and the current one picked (`0x81b88`);
    picking a row makes that user current at once (`0x81bc0` → `0x827c0`).
  - Rename, Delete and Load Profile are disabled while the list is empty (`0x8120c`,
    `0x814ac`, `0x81748`). Load Profile closes the dialog and applies the profile (`0x3b190`).
  - New opens the name dialog in mode 1 and Rename in mode 2 (`0x819e4`, `0x81764`); Delete
    opens the question (`0x814c8`).
- List box (`0x2f0e8` over `0x2ead0`): rows 36 px tall; `GUI.DIALOGS.COMBOBOX.BACK`
  stretched to width + 24 by rows·36 + 64 (its picture cut at 32 and 64 down: a cap, the
  rows, a cap), from (−width/2 − 12, −rows·18 − 32); the picked row lies on
  `GUI.DIALOGS.COMBOBOX.TEXT_REMARK` stretched to width + 12, 38 tall, from −width/2 − 6;
  `ARROW`, `REMARK_UP` and `REMARK_DOWN` are for the caps. Text in `FONTS.WHITE`.
  - Update (`0x2e6ec`): a touch within the rows' width in the 30 px above them picks the row
    before, and in the 30 px below the row after (keys too); the rows themselves take no
    touch. The first row shown follows (`0x2e678`): the picked row less the rows shown plus
    one if it is past the last shown, the picked row if it is before the first.
  - Draw (`0x2e478`): the frame; the caps' highlights while pressed; `ARROW` in the 30 px
    above the rows and, turned over, in the 30 px below, at 0.7 when there is no row that way;
    then the rows shown, 36 px apart from `floor((36 − height)/2)`.
- Name dialog (`0x805ac(dialog, mode)`): 340×200; `ENTER_YOUR_NAME`, or `RENAME_THE_USER` in
  mode 2, centred at y −80 in `FONTS.WHITE`; a text field `0x2e1e8` 170 wide at (0, −20); an
  accept button (`0x81bec`, Enter presses it too: `0x81e58`) at (−90, 70) and `CANCEL`
  (`0x2f328`) at (90, 70), 130 wide. The field starts with the current name in mode 2;
  otherwise with `DEFAULT_USER_NAME`, a `*` appended for as long as some user has that name
  (`0x80704`).
  - Text field (`0x2e208`): `GUI.DIALOGS.EDITBOX` stretched sideways to width + 36, from
    (−width/2 − 18, −31); a text too wide for the width loses its last characters (`0x2e3d0`).
    Drawn (`0x2dbf8`) with the text centred, a character at a time, and a caret 3 px after
    it with opacity `4·(sin(8t) + 0.5)`.
  - Accepting (`0x80124`): spaces around the name are dropped; an empty name opens the note
    with `NAME_NULL`, one some user already has (`0x82808`) the note with `NAME_REPEATED`;
    otherwise modes 0 and 1 add the user (`0x82694`) and mode 2 renames the current one, and
    the list is saved.
- Note (`0x803cc(dialog, repeated)`): 340×240, its text in (−150, −105)–(150, 95) and `BACK`
  200 wide at (0, 90).
- Delete question (`0x7fe40`): 400×200, `DELETE_USER_DIALOG.TEXT` with the current name in
  (−190, −90)–(190, 40), `YES` (`0x81ea4`) at (−90, 65) and a closing button 100 wide at
  (90, 65); `SOUNDS.USER_CONFIRM_DELETE` plays as it opens.
- A user added (`0x82694`) goes to the end of the list and becomes the current one; deleting
  the current one (`0x82780`) makes the next in the list current, or the last if there is none
  after.
- `MAIN_MENU.HELLO_USER` and its sign are not referenced by the code.
- Web version: users and each one's progress are kept in the browser (`am2web.users.v1`,
  `am2web.progress.v2.user<id>`); the first user takes over the progress made before there
  were users, and without a user the game plays on that. The name is asked when the menu
  opens with no user. Not read, and so ours: how a row's text is aligned, the caret's shape and colour, the buttons' height (30), and that the
  note's and the question's texts are centred in their boxes (their text call's second flag
  is 0 where the hint's is 1). The browser's keyboard stands in for the device's.

## Awards — rules and room confirmed in part

- The room is laid out by `data/descriptors/awards_room_descriptor_table.xml`
  (`AWARDS.DESCRIPTOR_TABLE`, parsed by `0x1d5f8`): `DiplomaAward`, `PigAward`, `ClockAward`,
  13 `MedalAward` (ids 1–13, each with a `TextID`), 5 `SpecialTrophyAward` (ids 1, 2, 6, 4, 3),
  20 `AirplaneTrophyAward` and `AwardShine`/`Shine` entries; the `MiniGamePinAward`s are
  commented out. The room is wider than the screen (x up to about 920).
- Award classes: base `0x1b1e4(award, kind?, textId, rect, x, y, 100)`; diploma `0x1b9a4`
  (`AWARDS_ROOM.DIPLOMA`, `AWARDS.DIPLOMA`, touch rect ±60 × ±45), pig `0x1ba4c`
  (`AWARDS.STINGY_MANIAC`), clock `0x1bb18` (`AWARDS.FLYING_TIME`), plane trophy `0x1bcd8`
  (`AWARDS.PLANE_%d`, `AWARDS_ROOM.PLANES_TROPHIES.%d`), special trophy `0x1bf08`, medal
  `0x1c090` (heads bronze/silver/gold, `TAILS.%d`, `SILHOUETTE_%d`, `ICONS.%d`); description
  dialogs `0x1c428`, `0x1c6d8`. Room: images `0x1e114`, build `0x1e1b4`, update `0x1e6f0`,
  draw `0x1ed68`, `0x1f2d4`.
- State (`0x1b6cc`): the profile (`0x827a8`) keeps 20 bytes per award id from `+0x58`: for
  awards of kind 3 the number at `+0x58 + 20·id`; for kinds 1 and 2 the length of the vector
  of 8-byte entries at `+0x5c + 20·id`. `0x1b70c` picks the sound by award id and `0x1b798` a
  number from 2 to 6 by id.
- Earning: the game posts events `{id, value}` to an event manager (`0x9d60()`, post
  `0x9db0`; listing the 26 sites: `tools/re/sites.py 0x9db0`). Every award listens
  (`0x1cfc8`) and takes the events whose id is its own (`0x1b3c8` → `0x1b3f8`), unless
  `app[0xfc]+0x128` is set and the id is not 0. A new award is then announced (`0x318e4`).
- Award ids, from the sites: 0 diploma; 1–20 the plane of that type; 21–33 the medals 1–13;
  34–39 the special trophies 1–6; 40 and 41 the pig and the clock (by elimination).
  - `0x7f7de` (tutorial's end): {0, 0}.
  - `0x83e2` (plane, `0x6af0`): {plane type `+0xc`, 0}; `0x83b4`: {21 or 22, 0}; `0x7d26`:
    {23, 0}; `0x7c18`: {24, length of a vector}.
  - `0x6dc7a`, `0x6dcae` (runway, `0x6db18`): {25, combo count} when the count at `+0xbc`
    or `+0xb8` is 4 or more.
  - `0x671e` (hangar done): the profile's `+0x34` is counted up, and {29, count} posted as it
    passes 50, 100 and 250. `0x67fe` (wash done): `+0x3c`, {33, count} at 25, 50 and 100.
  - `0x21bee`, `0x49716`, `0x592a8`, `0xbcbca` (bonuses): {32, 0}.
  - `0x10032` (score, `0xfffc`): {35, 0} when a total reaches 1 000 001.
  - End of level (`0x11654`): {28, n}, {26, 0}, {34, 0}, {30, 0}, {31, 0}, {27, 0}, {40, 0},
    {36, 0}; `0x11d94`: {41, seconds}; `0x10d50`: {a running id, 10}; `0x114e4`: {39, 0} when
    every medal (ids 21–33) is at level 2, and {37, 0}.
- Taking an event (`0x1b3f8`), by the award's kind (`+0x28`); the profile's record is a flag
  (`+0x54`), a value (`+0x58`) and a list of {level, stage} pairs (`+0x5c`):
  - kind 0: once only; the flag is set and the value kept.
  - kind 1: once per stage (the pair {0, stage} must be new).
  - kind 2: once per level of a stage (the pair {level, stage} must be new).
  - kind 3: only when the value beats the one kept; the pair is added.
  What an award counts (`0x1b6cc`): the pairs for kinds 1 and 2, the value for kind 3.
- Kinds: diploma, plane and special trophies 0; pig 1; clock 3; medals by id (`0x1c266`): 21,
  22, 23, 26, 28 and 32 are kind 2; 24, 25, 29 and 33 kind 3; 27, 30 and 31 kind 1.
- A medal is bronze once earned, silver from its first threshold and gold from its second
  (`0x1c404`, thresholds `+0x6c`, `+0x70` set at `0x1c2a2`): 21: 3, 6; 22: 3, 7; 23: 2, 3;
  24: 4, 6; 25: 10, 15; 26: 20, 48; 27: 4, 9; 28: 8, 16; 29: 100, 250; 30: 4, 9; 31: 4, 9;
  32: 8, 24; 33: 50, 100.
- Conditions, as read at each site:
  - Landing done (`0x8378`): a pregnant passenger posts 21 and an organ 22; then the plane's
    type is posted. The president posts 23 as the plane leaves (`0x7cfc`) unless its mood is 3.
  - Planes changing places (`0x7ab4`) post 24 with how many they were.
  - A runway combo posts 25 with its count when it is 4 or more.
  - Balloons (`0x21bcc`): 32 when they are over and the flag at `+0x34` is clear; helicopter
    (`0x49700`): 32 when it leaves with `+0x50` at 6 or more and that flag clear. Two other
    bonus classes (`0x59140`, `0xbca34`) post it at 7.
  - Score (`0xfffc`): 35 when a level's score, at 999 999 or less, reaches 1 000 001 or more.
  - The goal reached with the time already over (`0x11f08`, `+0x90` set and `+0x70` clear):
    41 with the whole seconds played since (`+0x8c`).
  - End of level (`0x11a30` on): 28 when every gate's combo (`+0xc4`) is 4; 26 when no plane
    was lost and the planes (`+0x134`) equal both `+0x140` and `+0x14c`; 34 on the last level
    of the last stage (`app+0x248`). Then, if the stage has been played through: 30 when every
    level's tier (`record+0x38`) is 4 or more, 31 when 5, 27 when every level's fewest lost
    planes (`record+0x18`) is 0, 40 when no level has improvements (`record+3`). With 34
    earned: 36 when 30 has been earned in every stage.
  - `0x114e4`: 39 when every medal is gold; 37 when 31 has been earned in every stage. 38
    (Game Master) is posted nowhere found.
- Web version: awards and the two counts are kept with the user's progress. Taken, not read:
  that `app[0xfc]+0x128` is the tutorial (only the diploma is earned there), that the diploma is
  for passing the academy's third day, that the bonus flag `+0x34` means a balloon got away
  (and nothing for the helicopter), that `+0x140`/`+0x14c` are the early arrivals and
  departures, that `+0x70` plays no part, and that the end-of-level events are for a passed
  level. The combo's event is posted when the port resets the combo. Levels played before the
  fewest lost planes were kept do not count for Friendly Skies until played again.
- Announcing (`0x318e4` → `0x31dc4`): the award's `<text>.EARN`, formatted with its value
  (`0x1b3ac`), in `FONTS.MAIN` at 0.8 wrapped to 240 px (`0x25218`), about (240, 160). Its
  sound by id (`0x1b70c`): 1–20 `AWARD_NEW_PLANE`, 21 `AWARD_BABY_CRY`, 22
  `AWARD_EMERGENCY_SIREN`, 23 `AWARD_PRESIDENT_MARCH`, 24 `AWARD_SWITCH_A_ROO`, 25
  `AWARD_SUPER_RUNWAY_COORDINATOR`, 34 `AWARD_FINISH_ALL_LEVELS`, the rest `AWARD_GENERIC`.
- Room draw (`0x1ed68`), everything on the wall moved by the scroll (`+0x70`): `AWARDS_ROOM.BACK`
  scaled (16, 10) from x −48; `AWARDS_ROOM.SHELF` at (10, 285), (490, 125), (490, 205) and
  (490, 285); the awards; shines and sparkles (a sparkle is drawn while −40 < x < 520, its size
  breathing by a sine); then the curtains, which are stretched over the screen and drawn back
  as the room opens (`+0x50`, eased), the ribbon and the text at (240, 25) in colour
  (0.275, 0.157, 0.047). A back button (`0x4bb84`) at (50, 40). Past the awards the wall goes
  on to a leaderboard (`0x1f2d4`).
- An award on the wall (`0x1b588`): at its table position, 10% larger at most while touched
  (`+0x30`). Earned (`vtable+0x2c`): its picture; a medal (`0x1c67c`) its ribbon
  (`TAILS.<n−1>`), the head of its material and its icon (`ICONS.<n−1>`); pig, clock and
  medals also what they count, as `%d` in `FONTS.SMALL_WHITE` at (1, 23), when it is 2 or
  more (`0x1b65c`). Not earned (`0x1b920`): the picture in black at 0.25; a medal
  (`0x1c644`) its silhouette (`SILHOUETTE_<(n−1) mod 3 + 1>`) in black at 0.2.
- Room update (`0x1e6f0`), states 1 opening, 2 open, 3 leaving: the clock at `+0x50` rises
  to 1 over a second, and falls as fast before the room is left (`0x1e5cc`).
  - Curtain (`0x1efb8`): with `t = clamp(1.5·(1 − clock))` and `e = 27 + 300·t²(3 − 2t)`,
    `CURTAIN_TOP` is drawn stretched 13 times down with its lower edge at e, and
    `CURTAIN_BOTTOM` hangs from e.
  - Sparkles (`0x1e766`), while open: every 0.15 s `rand mod 42` picks an award id; if that
    award is had, a sparkle is made with a clock of 2, a size `0.5 + rand·0.5`, an angle
    `rand·360`, at one of the award's three `Shine` points (`rand mod 3`). Drawn (`0x1eef2`)
    with scale `size + 0.2·sin(2·clock)`, turned `angle + 200·clock`, opacity
    `clamp(2·min(clock, 2 − clock))`, while −40 < x < 520.
  - Pages (`+0x78`, count `+0x3c`): a touch within x 0–110, y 0–48 goes to page
    `min(x div 36, count − 1)`; a finger's movement is smoothed (0.7 kept, 0.3 new) and, over
    3 px, turns the page on when its direction's x is under −0.6 and back when over 0.6.
  - Slide (`0x1eac0`): the wall's place (`+0x70`) goes to `−480·page` with a speed (`+0x74`)
    that gains 8000 px/s² towards it; within `1.5·v²/8000` of it and moving towards it, the
    speed is kept at 50 at least and loses 8000 px/s², and the wall is put on the page when
    the next step would pass it. Within 1 px the speed is zeroed.
  - Page numbers (`0x1f0f4`): `AWARDS_ROOM.<n>` at (`30 + 26·i`, 24), with d the page's
    distance from the wall's place in pages: scale `1 − (d < 0.75 ? d/2 : 0.375)`, nudged
    8 px aside per page of distance, at most 8.
  - Back button (`0x1e2b6`): 50 by 40 at (430, 20).
- Award dialog (`0x1aaf4`): 400×250; the name (`<text>.NAME`, a medal's with its material
  filled in once earned) in `FONTS.MAIN` centred in (−190, −110)–(190, −80); in
  (−180, −70)–(180, 70), `FONTS.WHITE`, `<text>.PRE_DESCRIPTION`, or `<text>.DESCRIPTION`
  once earned; Close 340 wide at (0, 105).
- Notice (`0x31b48`): state 1, its clock rises at 5 a second to 1, drawn at scale
  `1.5 − 0.5·clock` and opacity the clock; state 2, the clock is set to 4 and falls, and a
  touch or its end goes to state 3 (`0x32030`), where it falls from 1 at 5 a second, drawn at
  scale `0.5 + 0.5·clock` and opacity the clock. Particles are thrown as it starts (`0x31648`,
  as many as `0x1b798` gives for the award).
- Web version: the room is opened from the map's Awards button. Not built: the third page (an
  online leaderboard, `0x1f2d4`), the keys that turn pages, the notice's particles, an award
  swelling while touched. Taken, not read: the ribbon's width, that the value filled into a
  description is what the award counts, that a touch must be on the notice to send it away,
  and what the earned branch of the dialog computes at `0x1ae08`.

## Starting a game — confirmed

- The main menu's Play (`0x5d024`): with no user, the name dialog in mode 0; with the profile's
  flag `+0x44` set, the dialog at `app+0x120`; with nothing reached yet (`profile+0x14` zero),
  the tutorial question (`app+0x114`, also opened once the first name is accepted, `0x80390`);
  otherwise the map (`app+0x14c`).
- Tutorial question (`0x7e590`): 400×250; two choices (`0x7ea9c`) at (−170, −90), picked, and
  (−170, 20), with `TUTORIAL_QUESTION_DIALOG.DO_TUTORIAL` and `SKIP_TUTORIAL` in `FONTS.WHITE`;
  Play (`0x7e7d0`) 260 wide at (0, 110).
- Its Play (`0x7ea3c`): the profile's level becomes 1; with the first choice the stage becomes
  0 and the tutorial starts (`0x70ce4`); with the second the stage reached, the level reached
  and the stage all become 1 and the map opens.
- Web version: the name is asked at Play, as there. "Nothing reached yet" is kept as a mark
  set when the question is answered, either way, or a level has been played. The inside of a
  choice is not read (a check box with its text to its right), nor what `+0x44` and
  `app+0x120` are.

## Plane information dialog — confirmed

- Built by `0xdbfc(dialog, award)`: 400×250; the plane (`0xa83c` by the award's id) gives its
  name (`Name`) in `FONTS.MAIN` centred at y −108 and its description (`Description`) in
  `FONTS.WHITE` in (−210, −90)–(210, −35). Rows, label left from x −83 and value right to
  x 191: y −30 `PASSENGERS` and the passengers (`+0xa8`); −10 `PATIENCE` and the text named by
  `Patience` (`+0xa0`); 10 `LOAD_SPEED` and the text named by `LoadingSpeed` (`+0xa4`); 30
  `MAXIMUM_EARNINGS` alone; 55 `LANDING_TAKEOFF` and the runway points (`+0xc0`) as money in
  `FONTS.SCORE`; 80 `ARRIVAL_DEPARTURE` and the gate points (`+0xac`) likewise. Close 380 wide
  at (0, 110).
- Its draw (`0xe45c`) adds the award itself, drawn as earned, at (−150, 20).
- Opened as the notice of an award with id 1 to 20 leaves (`0x32044`), and from a plane trophy
  in the awards room when it is had (`0x1bed6`); a trophy not had opens the award dialog.
- Web version: in a level it is not opened if another dialog is up.

## The ending — confirmed in part

- Leaving the clear screen of a stage (`0x78a9c`): below the last stage (`app+0x248`) the next
  one is opened and the map shown; on the last, the loading screen is asked for mode 0
  (`0x70ce4`), whose end shows the scene kept at `app+0x184` (`0x71390`).
- Scene (`0x3473c`), in order: `FINAL_VICTORY.SKY` stretched over the screen; clouds
  (`0x36bb8`); ground (`0x361bc`); the little plane (`0x35ffc`) and three more floating
  pictures (`0x35ce4`); the congratulations (`0x35194`); the way back (`0x34ea4`). Music
  `MUSICS.FINAL_VICTORY.INTRO` then `LOOP`. Update `0x34ad8` hands every one the frame's time.
- Floating picture `0x35ce4(resource, place, delay, scale)`: its clock starts at −delay. Little
  plane (189, 87), 8, 0.5, with `LITTLE_PLANE_PROPELLER` turned `5000·t` degrees; military plane
  (96, 182), 7, 0.75; transborder (360, 120), 6, 0.85; main character (240, 204), 5, 1. Draw
  (`0x35e6c`): under 2, with u = 2 − t, moved (`60u²·scale`, `−160u⁴·scale`) and turned
  `25u²`; always turned `7·sin(0.3t)` and moved (`11·sin(0.47t)·scale`, `10·cos(0.53t)·scale`),
  then to its place.
- Ground: four rings of thirty pairs, the pair i at depth `i/4 + from`: buildings (five
  pictures) from 40, canyon (four) from 30, mountains (six) from 20, palm trees (three) from 10.
  A pair is picture `i mod n` 120 px right and picture `(i + 3) mod n`, mirrored, 120 px left
  (`0x36970`). Depths rise one a second and go round at 50. Drawn (`0x367f4`) from the last made
  to the first, under depth 10: foot at (`240 + side/(z + 0.5)`, `320 + 42z`), scale
  `1/(z + 0.5)`.
- Clouds: fifty, picture `rand mod 4`, depth `0.4·i`, across `48·i − 1200` dealt at random;
  depths rise one a second and go round at 20. Drawn (`0x36e86`) farthest first, under depth 10:
  foot at (`240 + x·k`, `42z`), scale `k = 2/max(0.1, z)`.
- Congratulations: `FINAL_VICTORY.CONGRATULATIONS` in `FINAL_VICTORY.GIANT_FONT` (Blue Stone at
  22, 0.8 wide, kerning 2), its letters side by side centred on x 240; its clock starts at −1
  and it is drawn between 1 and 9. Letter i of n has `t = clock − 1 − 0.7·i/n` and a swell
  (`0x357a4`) of `2t` under 0.5, `2(4 − t)` over 3.5, else `1 + 0.25·sin(2π(t − 0.5))`; scale
  `0.5 + 0.5·swell`, opacity `clamp(2·swell)`.
- After a wait (`+0xc`) the credits roll is made at (240, 160), speed 40, delay 20 (`0x34b46`);
  when it has run to its end the way back is shown, which leads to `app+0x150`.
- Web version: opened with `?ending`, reached from the last stage's clear screen, and it goes
  back to the main menu. Taken, not read: the first wait (10 s; `0x3433c` has 10, 2.5 and −9),
  the way back's place (20, 305), where a floater's scale is applied, the giant font's colours,
  that the text is at height 160. The loading screen between is not built.

## Leaving a level from its menu — confirmed

- The finish dialog's buttons: Main Menu (`0x37b68`) saves and goes at once; Go to Map
  (`0x37e44`) opens the question at `app+0x1b8` and Restart Level (`0x380e4`) the one at
  `app+0x1a8`.
- The questions (`0x3710c`, `0x373e8`): 400×200, `GO_TO_MAP_LEVEL_DIALOG.TEXT` or
  `RESTART_LEVEL_DIALOG.TEXT` in `FONTS.WHITE` in (−200, −100)–(200, 40), `YES` at (−105, 80)
  and a second button at (105, 80), 170 wide. Yes restarts (`0xf7c0`) or goes to the map; the
  second button closes the question and opens the finish dialog again (`app+0x17c`).
- The message `PERFECT_SCORES_UNLOCKED_MESSAGE` (`0x6a6cc`: 400×250, the tips shower saying it,
  `OK` 360 wide at (0, 110)) is made at start and kept at `app+0x180`, which no game code reads:
  it is never shown.
- Web version: the second button's label is taken to be `NO`.

## Tips as a level starts — confirmed

- As the day's opening is closed (`0x519e2` → `0xf4ac`): if the profile's count of tips shown
  (`+0x30`) is under the number of tips (`+0xc0` of the texts), a `GameTip` is made with that
  number and the count goes up one.
- `GameTip` (`0x40314`): a tips shower 420 wide showing `GAME_TIP.<n>`, drawn at (240, 260)
  (`0x404cc`), with a clock of 8 s. Update (`0x40408`): the clock runs down and the tip goes at
  zero; under 7, a touch takes 4 s off it and takes as much off the clocks of a list of the
  level's (`0x14834`, `level+0x80`).
- `CoffeeAndCake` and `InFlightMovies` (`0x243c4`, `0x24620`) are the service tabs, built.
  `ClickeableMessage` (`0x24b58`, a speech bubble with `<key>.<n>`) is only made by name, and
  nothing in this build's data names it.
- Web version: the touch must be on the tip, and the level's list is not touched. No tip is
  shown when the opening is skipped with `?nointro`.

## Place flash — confirmed

When an order is accepted (`0x1129a`) the place flashes in the plane's colour (`0x6aea0`: level
set to 1, colour kept).

- The level falls at 3 a second (`0x6aee0`).
- Draw (`0x6af20`, slot 18 of every place; slot 5 is `0x6b20c`): the place's remark image six
  times over, all at the level as opacity. Copy `i` is `15·i·(1 − level)` px wider and
  `10·i·(1 − level)` px taller, and its hue is the plane colour's + `10·i − 25`°, with the same
  saturation and value (`0x6b620` to hue, saturation and value, `0x1fed8` back).
- The image is loaded by `0x6abc8` into `place+0x24`, by slot 19 of each class. Runway:
  `RUNWAY.REMARK`. Gate, gas station, hangar and luggage conveyor: their descriptor's. Stop spot
  (`0x78b74`), by its kind at `+0x64` and a flag at `+0x68`: kinds 0 and 1 (plain and VIP)
  `STOPSPOT_REMARK`, or `STOPSPOT_UP_REMARK` with the flag; kind 2 `STOPSPOT_ISLAND_REMARK`;
  kind 3 `STOPSPOT_ISLAND_VIP_REMARK`. No stage script sets the flag (run with every improvement
  in `tools/re/stage_layout.py`), so the "up" images are never used.
- The painting stop spot's slot 19 is empty (`0x67bb4`) and the wash and go's loads only its own
  image (`0x84a08`): neither has a remark image, so neither flashes.
- Where each draws it: the runway last (`0x6e1e2`), the gate over its letter (`0x439ac`), the
  hangar over its back half (`0x476c6`), the gas station and the luggage conveyor over their
  backs (`0x40f62`, `0x56fc2`).
- Web version: the stop spot's is drawn over its image on the ground; where the original's draw
  puts it has not been read. `tools/re/dataref.py` finds the code that forms a data address.

## Combo explosion — confirmed

Made with the `IN_GAME.BONUS_X` text, at the plane's place (`plane+0x30c`) and three behind its
depth (`plane+4` − 3): by the gate with its combo (`0x4340a`) and by the runway with its count,
4 at most (`0x6d6ac`, `0x6d814`). Constructor `0x26bd8(place, depth, multiplier)`.

- The explosion itself shows nothing. It loads `EFFECTS.BONUS_REMARK` and lives two seconds
  (`0x270c0`), but its draw (`0x270e8`) only works a transform out and never hands it to the
  image: the picture is never drawn.
- It makes a fan of light (`0x691dc`), put among the airport's sorted objects at that depth, and
  from a multiplier of 2 stars (`0x6989c`), put on the airport's own list after everything, so
  over planes and places: thrown at (−45, −270) and (45, −270); from 3 also (60, −260) and
  (−60, −260); from 4 also (−40, −250), (40, −250), (70, −220) and (−70, −220) px/s.
- Fan (`EFFECTS.LIGHT_FAN`): its clock `T` runs from 0 to 1 at 0.6 a second (`0x692b4`). Draw
  (`0x692e8`): the whole is scaled `1.5·(1 − ((0.4 − T)/0.4)⁴)` across until 0.4 and
  `1.5·(1 − ((0.3 − T)/0.3)⁴)` up until 0.3, 1.5 after; opacity `min(1, 10T, 2(1 − T))`. Nine
  rays, ray `i` with, before that scale: length `1 + ((3 + 123i) mod 13 − 3)/30`; turned
  `((3 + 119i) mod 13 − 6)·3 + ((1 + 117i) mod 19 − 8)·1.5·T` degrees; blue
  `1 − (7i mod 5)/15`; at (`(171i mod 23 − 11)·0.7`, `(131i mod 29 − 14)·0.2`).
- Star (`EFFECTS.BONUS_STAR`, additive): two seconds of life; it moves with its speed and falls
  at 150 px/s² (`0x9f18`: place += (speed + ½·a·dt)·dt, so an exact parabola); angle random,
  turning at −180 to 180°/s; size 0.7 growing 0.3 a second; colour three random parts from 0 to
  0.3 and opacity from 3 to 4 dropping 2 a second (`0x69a88`). Draw `0x69b40`.
- Checked by running the fan's draw (`tools/re/draw_trace.py 0x692e8 …`): the web version's
  matrices agree with the original's to the fourth figure.

## How the engine draws: transforms and colour — confirmed

- A transform (`0xb3e80` makes one) is flags, then red, green, blue and opacity (`+4`…`+0x10`),
  then a 3×3 matrix at `+0x14` that multiplies a row vector: in Pixi's terms a `+0x14`, b
  `+0x18`, c `+0x20`, d `+0x24`, tx `+0x2c`, ty `+0x30`.
- Each step is applied after the ones before: `0xb40e4` moves, `0xb41e0` scales, `0xb4114` turns
  by degrees (the same way round as Pixi's `angle`), `0xb4240` skews, `0xb4290` multiplies the
  colour by four floats, `0xb42f8` multiplies the opacity, `0xb4318(out, a, b)` is `a` then `b`.
  An image is drawn by slot 6 of its vtable (`+0x18`) with a transform.
- Colour to the renderer (`0x9c148`): for an additive image (blending 2: `glBlendFunc(ONE,
  ONE)`) and for blending 4 (`ONE, ONE_MINUS_SRC_ALPHA`) red, green and blue are first
  multiplied by the opacity; then each of the four is held within 0 and 1 (`0x9a240`) and sent
  as a byte. So an additive image's opacity may be over 1 and brightens it. Blending 1 does not
  blend, 3 is the usual (`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`), 5 multiplies (`DST_COLOR, ZERO`)
  (`0x9be74`).
- `tools/re/draw_trace.py <function> [field …]` runs a draw routine in the emulator on a made-up
  object and prints the transform of every image it draws.

## What has not been read

See `docs/audit.md`: the share of the game logic read so far and the runs of code not yet
opened, by what each seems to be (`tools/re/audit.py`).

## Floating texts: wobble, stacking and fade — confirmed (settings not found)

List class at `plane+0x358` and on the level; add `0x656a8`, update `0x658d0`, draw `0x65934`.

- Add: the place is floored to whole pixels; the text's height is its font's plus 2. If the
  newest text already up has risen less than that height, it and each one before it, while
  within 5 px of the new one's place, are pushed up by the difference (and aged by half the
  push divided by... the list's rise speed is not applied here: `+8` grows only when the pushed
  offset passes the list's `+8` limit, by 0.5).
- Update: age `+8` grows by dt and the offset `+0x20` by dt times the list's `+0x10`; a text is
  dropped when the oldest's age passes the list's `+0xc`.
- Draw: for the first two thirds of a second (`t = 1.5·age < 1`) it is stretched
  `1 + 0.1·(1 − t)·sin(2πt)` across and `1 + 0.2·(1 − t)·sin(3πt)` up; opacity is whole until
  one second before the list's lifetime and then `lifetime − age`.
- **Not found**: where the list's lifetime (`+0xc`) and rise speed (`+0x10`) are set; the web
  version keeps 1.4 s and 18 px/s of its own.

## The tester's name — confirmed, deliberately not built

A user named `qatester911` switches two things on:

- Entering the map (`0x5fb44`) sets the byte `0x181364` if any user has that name; the level
  markers' constructor (`0x5db60`) then marks every level open (`+0x78`).
- The improvements dialog (`0x4c3c8`, at `0x4c7d2`) gives the current user of that name a "$"
  button (class vtable `0x178418`, made by `0x2cc58` with 40, 35, 0, 20, 0); pressing it
  (`0x4d37c` → `0x4c154`) adds 1 000 000 to the level's funds and plays a sound.

It is a testing back door; the owner of this port chose to leave it out (2026-10-10).

## The goal bar's tiers, and what reaching one throws — confirmed

`0x11d94`, called by the level's update after its main part (`0x1238c`).

- Tiers reached `level+0x1b4`, of `+0x1b8`; progress inside the next `+0x1ac`; goals at `+0x1bc`.
  Below the last tier (`0x11e1c`) the progress runs after
  `(score − G[t−1]) / (G[t] − G[t−1])` at that distance a second, 0.05 at least and 0.9 at most
  (`0x11e78`), stopping on it.
- Progress at 1 (`0x11efa`): the tier is counted and 1 taken off the progress. The level then
  makes the tier's name (`0x71a24`, from the table `0x17971c`: `SCORE.GOAL_SCORE` …
  `SCORE.PERFECT_SCORE`), plays `SOUNDS.GOAL_%1d_ACHIEVED`, and throws `10·tier` stars
  (`0x69640`) and `13·tier` sparks (`0x69c28`), all on the level's own list (`level+8`).
  Reaching the first tier with the time over is what posts award event 0x29.
- Progress under 0 with a tier reached (`0x12188`): `SOUNDS.GOAL_1_LOST` for the first tier,
  `SOUNDS.GOAL_GENERIC_LOST` otherwise; the tier is taken back and 1 added to the progress. With
  every tier reached and the score under the last goal (`0x12258`) the same, the progress set
  to 0.999. With no tier a negative progress is set to 0.
- Either way `level+0x1dc` is set again to 10 if a plane is on the ground and 3 otherwise: the
  end of the level waits for it.
- Name (`0x71a34`; update `0x71b58`, draw `0x71c20`): `FONTS.ULTRA`, centred at (253, 16),
  three seconds: it sinks 20 px/s, is scaled `0.6 + 0.1·age`, comes in over half a second and
  goes over the third.
- Star off the bar (`0x69650`): at x 195–315, y 10–15; speed x −60…60, y −100…0; the rest as the
  combo's star. Spark (`0x69c38`, `EFFECTS.SPARK`, additive): the same place, speed x −60…60,
  y −70…0; one second, falling at 150 px/s², opacity twice the time left (`0x69d5c`).
- The hangar (`0x4747e`), while working, counts `hangar+0x90` down by its `Speed` × dt; under 0
  it throws a spark from (plane x − 10…+10, plane y − 35…−15) at (−50…50, −100) and adds
  0.1 to 0.6.
- Web version: all of it, with these marked as ours: the effects are drawn over the HUD (the
  order of the level's list against the HUD is not read); the name's top is put at its place
  (the engine's vertical alignment for `0x94650` is not read); the hangar's first wait is 0.

## Black smoke of a plane that needs the hangar — confirmed

- Plane update (`0x6da8`): while the service flag `+0x26a` is clear, `plane+0x274` counts down;
  under 0 it adds 1.2 to 1.45 s (`0x6de0`) and a puff (`0x75ed8`) is put among the airport's
  sorted objects (`0xf5c8`) one behind the plane: at (x, y − 10), with the plane's speed
  (`+0x2e0`, `+0x2e4`) plus 50 px/s the way it is mirrored (`+0x224`) and, in the puff's
  constructor, 50 up.
- Puff (`0x75ee8`, `EFFECTS.SMOKE_BLACK`): angle −15…15°, turning −15…15°/s, scale 0.5 growing
  0.8 a second, one second of life. Update (`0x76058`): after moving, its speed is moved towards
  (0, −50) by `0.2^dt` of the gap, nearly all of it at any usual frame rate. Draw (`0x7615c`):
  opacity `4·clock` under a quarter of a second, `2 − 2·clock` after.
- Web version: the plane's speed is taken from how far it moved in the frame; the first wait is
  taken as 0 (where `+0x274` starts is not read).

## Fireworks of an award's notice — confirmed

- `0x31648`, as the notice starts: as many rockets (`0x38bbc`) as `0x1b798` gives for the award:
  ids 1–20 `min(6, id/3 + 1)`; 24–29, 32, 33 three; 30, 34, 35 five; 31, 36 six; the rest two.
  Each from (120…360, 300) at (−80…80, −200…−250) px/s, with one of four burst pictures by
  `rand % 4`. They go on the notice manager's list (`+0x10`).
- Rocket (`0x38bcc`; update `0x38d50`, draw `0x3916c`): gravity 100 px/s². Its draw only draws
  its sparks, so neither it nor its burst picture (`EFFECTS.FIREWORKS.EXPLOSIONS.%d`, loaded)
  is ever seen. For 2 s, every 0.015 s (first after 0.1 s) it leaves a spark at its place with
  speed −3…3 each way and life `min(rocket's clock, 0.5…1)`, advanced by the overrun. Past 2 s
  it bursts once: 60 sparks, spark `i` at angle `2π·i/60`, speed 0…100 px/s along it plus the
  rocket's speed plus −10…10 each way, life 2…2.5 s. It ends when its sparks are gone.
- Spark (`EFFECTS.FIREWORKS.SPARK`, additive; update `0x393e0`, draw `0x393ac`): gravity 60,
  speed multiplied by `0.3^dt` each step, opacity its life left.
- Web version: drawn under the notice's text (the order is not read).

## The level's bird — confirmed unused

`Bird` (`0x22c2c`, images `BIRD.%d`) is a class made by name through the object registry
(`0x22c00` in the table at `0x1765b4`). No data file names it and no code makes it directly, so
no level ever has one. The map's birds (`0x5e098`) are another class.

## World map: what the script makes, in order — confirmed

From a run of the script in the emulator
(`AM2_RE_NATIVE=0xccc8c,0xcda08 tools/re/stage_layout.py 0xccc8c --raw --floats`). Objects are
drawn in the order made, each moved by the map's scroll (`app+0x154`, `+4`/`+8`).
`tools/re/vtable.py <ctor start> <end>` prints a class's vtable: slot 4 draws, slot 6 updates.

1. `MAP.BACK` (`0x60a68` → sprite class `0x63988`, draw `0x63af8`).
2. Sea glints `0x60d84(count?, rect, a | b, c)`: (0, 702 367 844 433, 0.07 | 0.6, 0),
   (2, 11 22 130 142, 0.1 | 0.65, 0), (3, 1259 382 1530 452, 0.07 | 0.65, 40); class `0x5ee18`,
   `AMBIENT.WAVE_REFLECT`. The constructor makes `area·density/80` glints (8, 17 and 16) with a
   generator of its own that always starts the same, so they were read off a run of it
   (`tools/re/draw_trace.py 0x5ee18 --r1 0 --r2 ptr:702f,367f,844f,433f --r3 0.07f --stack 0.6f
   0f ptr:0,0 --stub 0xa4f30 0xa2e4c --vector 0x28:f`): x, y, phase, size each. Draw `0x5f0bc`:
   `v = sin(2π(frac(0.5·T) + phase)) − 0.3`; while over 0 the glint is turned by the patch's
   last number (0, 0, 40°), scaled `v·size` and drawn at opacity `0.7·v`. A drift (the pair the
   last argument points to) would slide it, but all three patches are given none.
3. Stage 1 icon and ribbon; stage 2 icon; `MAP.ISLAND_FRONT` at (214, 75); ribbon 2; stage 3
   icon and ribbon.
4. Three birds `0x60fd0` at (526, 255), (510, 255), (526, 272). Class `0x5e168`: rate 10–14 a
   second, phase 0–1, clock from 0–2000 wrapping at 22000 (update `0x5e2ac`). Draw `0x5e34c`:
   with `D = 0.06π·clock + phase`, at `(50·sin D, 30·cos D + cos(2π·clock + phase) +
   cos(11π·clock + 0.13) + cos(20π·clock + 0.15))`, frame `trunc(9·clock) mod 11` of `BIRD.%d`.
5. Stage 4 icon and ribbon; two snowfalls `0x61078(rect 542 0 746 143, image, 10 | 25, 0.05)`
   with `SNOW_FLAKES.3` and `.4`. Class `0x5e570` (update `0x5e6e4`, draw `0x5ea34`) is the
   level's snow with sides: drift 10, fall 25, interval 0.05; a flake comes in at
   `rand·(right + left) − left` (`0x5e8c0`) and is dropped once outside the sides or under the
   bottom, so most never show.
6. Clouds `0x61210(image, place, phase | swing)`: `MAP.CLOUDS.SMALL` (994, 34) 0.1 | 1, `MEDIUM`
   (1015, 73) 0.2 | 2, `BIG` (938, 72) 0.3 | 3.5. Class `0x63354`, draw `0x634dc`: y is moved by
   `swing·sin(2π·(frac(0.1·T) + phase))`, T the app's clock (`app+0x1ec`).
7. Stage 5 icon (`0x60408`, see below) and ribbon; four winds
   `0x60bec('MAP.WIND', p0, p1 | p2, delay, 2)`: (1014 164, 914 96, 860 52, 1.8),
   (991 189, 914 130, 841 67, 0.95), (980 220, 901 155, 824 106, 1.4),
   (916 218, 839 164, 778 137, 0.4). Class `0x39dcc`, see below.
8. Stage 6 icon and ribbon; the aurora (`0x60b44` → `0x637b8`, the level's class drawn with a
   transform, `0x63918`): scale (0.4, 0.85), turned 25°, at (1146, −63).
9. Stage 7 icon and ribbon; the carrier's waves `0x612d0` at (1368, 331), class `0x62a24`,
   `MAP.CARRIER_WAVES`; stages 8, 9, 10. The constructor, run in the emulator
   (`tools/re/draw_trace.py 0x62a24 --r1 obj --stub 0xa4f30 0xa2e4c --vector 0x1c:f 0x28:f
   0x34:x 0x40:i`), leaves 32 rows of four points: with `t = row/31` and `s = sin(2.19911·t)`,
   x −65s, −10s, 10s, 55s at y `45·(3.2·t^1.3 − 1.1)`, u 1, 0, 0, 1, colour white at opacity
   `0.8·min(1, 5(1 − t))`; triangles join points 0 and 1 of a row to the next row's, and 2 and
   3 likewise, so two bands. Draw `0x63024`: every row's v is set to
   `(1 − frac(0.2·T))/3 + row·2/93`; the mesh is skewed −0.5, turned 35° and moved, which the
   emulator gives as the matrix (0.819152, 0.573576, −0.983153, 0.532364). Web version: each
   strip between two rows has one opacity, the mean of its rows'.
10. Two shooting stars `0x60bec('AMBIENT.SHOOTING_STAR', …)`: (1445 12, 1423 97, 1390 212, 0, 30)
    and (1487 12, 1436 97, 1394 212, 15, 30).
11. Thirteen stars `0x60cc4(place, size)` (the level's class `0x292bc`): (1202 30) 8, (1336 93) 7,
    (1399 30) 10, (1485 38) 9, (1415 135) 14, (1448 229) 8, (1605 356) 12, (1678 379) 8,
    (1932 30) 18, (1844 74) 7, (1980 115) 10, (1902 208) 13, (1875 147) 13.
12. The satellite `0x61140((1813, 80), 4, 0.75 | 0.02, 2)`, class `0x5eb4c`: its clock starts at
    2, runs 0.02 a second and wraps at 4 (`0x5ec24`); drawn while under 0.75 (`0x5ec60`) turned
    `15·clock − 15`°, scaled `0.5 + 0.5·sin(π·clock/0.75)`, at
    `(−380·sin(π·clock), 350·cos(π·clock))` from its place; `MAP.SATELLITE_BRIGHT` over it at
    opacity `clamp(2·sin(250·clock) − 1)`.
13. Level markers (`0x606bc`), then the sign `0x6033c('MAP.SIGN_COMING_SOON', 10, 1630, 417)`
    (a stage icon's class, `0x5d3e8`), made only when the last stage (`app+0x248`) is not 10
    (`0xcd6c6`): never in this game, so the web version has none.

Stage 5's icon (`0x60408` → `0x5d680`, draw `0x5d7ac`, run in the emulator): with
`r = frac(0.1·T)` it is drawn `5·sin(2π·r)` px lower, with four `MAP.AIRBORNE_PROPELLER` on
it (`0x5d74c`: turn, scale, tilt, move), turned `14400·r` plus 0, 135, 90, 45°; scaled
(0.5, 0.9), (0.53, 0.95), (0.5, 0.9), (0.4, 0.8); tilted 38, 34, 28, 16°; at (−30, 30),
(−2, 25), (49, −1), (61, −17). Every icon is drawn `1 + 0.08·press` big (`+8`, eased by
`0xa068`), which the web version does not do.

Winds and shooting stars (class `0x39dcc`; update `0x39f58`, draw `0x39f8c` → `0x39fac`): the
clock starts at the fourth number, runs with time and wraps at the fifth; drawn while under
0.9, with `t = clock/0.9`, at opacity `clamp(4·min(t, 1 − t) − 1)`. The image is laid along a
curve through the three points by the engine's strip (`0x90778`, points `0x903f4`, draw
`0x908f8`), which cuts the curve into rows as it bends; each row is two points the image's
width apart with u 0 and 1, and v `clamp(2t − d)`, `d` being how far along the curve the row
is (0 to 1). Only rows from the last with v at 1 to the first with v at 0 are drawn. The rows
were read off runs of the draw (`tools/re/draw_trace.py 0x39dcc --r1 ptr:0 --r2 ptr:1014f,164f
--r3 ptr:914f,96f --stack ptr:860f,52f 0f 2f --stub 0xa4f30 0xa2e4c --then 0x39f8c --poke
0x24=0.45f 0x4=img:8x170`), and are kept as data in the web version. That draw is given no
scroll of its own; the web version moves the streaks with the map like everything else.
