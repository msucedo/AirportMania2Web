# Airport Mania 2 (web)

A browser reimplementation of the game engine, for personal local use. It contains no game
assets: they are imported from your own extracted copy and are never committed.

## Run

```sh
npm install
npm run import-assets            # reads ~/Desktop/AirportMania2_Assets (or pass a path)
npm run dev                      # http://localhost:5173  (?nodes shows the taxi graph, ?mute disables audio, ?lang=english picks a language)
npm test
```

## Status

Stage 1, level 1 is playable: select a plane, send it to a runway, then to a gate (it unloads and
loads there), then to a runway to take off. Orders can be queued. It is drawn with the original
HUD, fonts, texts, indicators and backdrop, and plays the original sounds and music.

The rules come from the original binary. What was read, what is assumed and what is still a
placeholder (plane colours, some draw details) is tracked in `docs/re-notes.md` and
`src/game/sim/rules.ts`.

## Layout

- `tools/import-assets.mjs` — copies assets and converts the data XML to JSON.
- `src/data/` — typed loaders for resources, planes, gates, runways and levels.
- `src/game/sim/` — deterministic simulation, independent of rendering.
- `src/game/levelScene.ts` — PixiJS view, input and HUD.
- `tools/re/` — helpers for reading the disassembly (`prepare.sh`, `reidx.py`).
- `tools/dev/play.mjs` — plays the first plane in a headless browser and takes screenshots.
