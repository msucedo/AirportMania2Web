# Airport Mania 2 (web)

A browser reimplementation of the game engine, for personal local use. It contains no game
assets: they are imported from your own extracted copy and are never committed.

## Run

```sh
npm install
npm run import-assets            # reads ~/Desktop/AirportMania2_Assets (or pass a path)
npm run dev                      # http://localhost:5173  (?map opens the world map, ?map=2 centres it on a stage and ?stage=2&level=3 opens a level directly, ?go skips the shop before a level, ?reset clears saved progress, ?nodes shows the taxi graph, ?mute disables audio, ?lang=english picks a language)
npm test
```

## Status

The game opens on the original main menu and world map: touch a level's marker, or Play for the
current one, and confirm in its dialog.
Two stages are playable, Arches with six levels and the island with seven. Options in the main
menu set the sound and music volume and, under Advanced, the language (eight are available);
during a level the menu button opens the original menu, with the options and the ways out.

Money works as in the original: a level's score is added to the funds of the next level, where
the improvements shop opens before play; clearing a stage pays its stars and a bonus into the
next stage. Progress is saved in the browser.

In a level: select a plane, send it to a runway, then to a gate (it unloads and, if it needs
nothing else, loads there), then to a runway to take off. Some planes ask for servicing in the
hangar and for fuel between unloading and loading. A landed plane can be parked on a stop spot,
where it loses energy more slowly. Orders can be queued. It is drawn with the original HUD, fonts,
texts, indicators and backdrops, and plays the original sounds.

Planes have their full faces (mood, blinking, talking), landing gear, propellers and the original
colours; the sky runs its day and night cycle with sun, stars and clouds; the island has its sea
glints, rings and buoys; runways show their combo arrows.

Not there yet: special passengers (transplant organ, pregnant), the painting stop spot, the coffee
and cake improvement, dirt and washing, the original menus and world map, and stages 3 to 10.

The rules come from the original binary. What was read, what is assumed and what is still a
placeholder (some draw details, the payout rule) is tracked
in `docs/re-notes.md` and `src/game/sim/rules.ts`.

## Layout

- `tools/import-assets.mjs` — copies assets and converts the data XML to JSON.
- `src/data/` — typed loaders for resources, planes, gates, runways and levels.
- `src/game/sim/` — deterministic simulation, independent of rendering.
- `src/game/levelScene.ts` — PixiJS view, input and HUD.
- `tools/re/` — helpers for reading the disassembly (`prepare.sh`, `reidx.py`, `stage_calls.py`).
- `tools/dev/play.mjs` — plays the first plane in a headless browser and takes screenshots.
- `tools/dev/shoot-level.mjs` — drives a plane that needs fuel through a level and takes screenshots.
- `tools/dev/shoot-flow.mjs` — checks a finished level, its report, saved progress, the shop and the next level.
