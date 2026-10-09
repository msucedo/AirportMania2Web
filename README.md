# Airport Mania 2 (web)

A browser reimplementation of the game engine, for personal local use. It contains no game
assets: they are imported from your own extracted copy and are never committed.

## Run

```sh
npm install
npm run import-assets            # reads ~/Desktop/AirportMania2_Assets (or pass a path)
npm run dev                      # http://localhost:5173  (?level=3 opens a level directly, ?reset clears saved progress, ?nodes shows the taxi graph, ?mute disables audio, ?lang=english picks a language)
npm test
```

## Status

Stage 1 is playable from a stage screen: six levels that unlock in order, stars and best scores
saved in the browser, and a shop where the funds earned with stars buy the stage's improvements
(a second and a VIP stop spot, gate C, faster gates, the regional plane licence).

In a level: select a plane, send it to a runway, then to a gate (it unloads and, if it needs
nothing else, loads there), then to a runway to take off. From level 3 some planes ask for fuel
between unloading and loading. A landed plane can be parked on a stop spot, where it loses energy
more slowly. Orders can be queued. It is drawn with the original HUD, fonts, texts, indicators and
backdrop, and plays the original sounds.

Not there yet: the transplant-organ plane of level 6, the painting stop spot, the original menus
and world map, and the other stages.

The rules come from the original binary. What was read, what is assumed and what is still a
placeholder (plane colours, some draw details, the payout rule) is tracked in `docs/re-notes.md`
and `src/game/sim/rules.ts`.

## Layout

- `tools/import-assets.mjs` — copies assets and converts the data XML to JSON.
- `src/data/` — typed loaders for resources, planes, gates, runways and levels.
- `src/game/sim/` — deterministic simulation, independent of rendering.
- `src/game/levelScene.ts` — PixiJS view, input and HUD.
- `tools/re/` — helpers for reading the disassembly (`prepare.sh`, `reidx.py`).
- `tools/dev/play.mjs` — plays the first plane in a headless browser and takes screenshots.
- `tools/dev/shoot-level.mjs` — drives a plane that needs fuel through a level and takes screenshots.
- `tools/dev/shoot-flow.mjs` — checks the stage screen, saved progress, the shop and the next level.
