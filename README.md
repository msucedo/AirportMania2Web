# Airport Mania 2 (web)

A browser reimplementation of the game engine, for personal local use. It contains no game
assets: they are imported from your own extracted copy and are never committed.

## Run

```sh
npm install
npm run import-assets            # reads ~/Desktop/AirportMania2_Assets (or pass a path)
npm run dev                      # http://localhost:5173  (?map opens the world map, ?map=2 opens it on a stage and ?stage=2&level=3 opens a level directly (stage 0 is the tutorial), ?go skips the shop before a level and ?nointro its announcement, ?reset clears saved progress, ?nodes shows the taxi graph, ?mute disables audio, ?lang=english picks a language)
npm test
```

## Status

The game is whole: opening screens, main menu, users, the world map, the ten stages (92
levels: Arches, the island, the monsters' stage, the North Pole, Airborne, Africa, the Antarctic,
the carrier, the Moon and Mars), the tutorial, the shop, the awards room and the ending.

The world map is drawn at its own size and is dragged both ways; it opens where it was left.
Touch a level's marker, or Play for the current one, and confirm in its dialog. Options in the
main menu set the sound and music volume and, under Advanced, the three switches and the colour
help; the language is the browser setting kept with the options (`?lang=` picks another of the
eight). During a level the menu button opens the original menu, with the options and the ways
out.

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

The tutorial (Airport Academy, three days) is played from the map's Tutorial button, with its
hints, goals and reports.

The awards are earned as in the original and shown in the awards room, reached from the map;
the online leaderboard is not there.
The stages' animated scenery is drawn (clouds, stars, the aurora, snow, Santa's sleigh, bats,
the skies of the Moon and Mars), and so are the wash, the luggage conveyor, the deicer and the
smoke planes leave on the runway; `docs/re-notes.md` lists what is still approximate.

The rules, layouts and drawing come from the original binary: `docs/re-notes.md` holds what
was read, with addresses, and says where something is ours; `docs/audit.md` holds how much of
the logic has been read (68.5% cited by address, the rest set aside with a reason in
`docs/unread.tsv`) and what each pass over it found. Left out on purpose: the publisher's
promotions, the online leaderboard, saving a level in play and the tester's back door.

## Sharper images (optional)

The original art is made for a 480×320 screen. `python3 tools/upscale-assets.py` builds an
enlarged copy of every image with Real-ESRGAN (`realesrgan-x4plus-anime`, stored at twice the
size in `public/assets-hd/`, which is not committed). When that folder exists the game uses it;
`?hd=0` switches back to the original pixels and `?hd=1` on again, and the choice is remembered.
The enlarged art is an interpretation by the model, not the original drawing. The script needs
Pillow and the Real-ESRGAN command-line build in `.tools/realesrgan/`; restart the dev server
after running it.

## On an iPhone, offline too

The built game can be kept on a phone's home screen and played there without a connection. It
needs no Apple certificate: it is a web page that Safari keeps. Safari only keeps a page for
offline use when it comes over HTTPS, so this computer serves it with a certificate of its own.

```sh
brew install mkcert              # once
python3 tools/make-icons.py      # once: the home-screen icon, from the game's own pictures
npm run phone                    # builds, then serves on the home network and prints the addresses
```

Then, on the iPhone, on the same wifi:

1. Once only, trust this computer's certificates: open `http://<address>:8080/rootCA.pem` in
   Safari and allow the download; Settings → General → VPN & Device Management → install the
   profile; Settings → General → About → Certificate Trust Settings → switch it on.
2. Open `https://<address>:8443/` in Safari and wait for "Listo para jugar sin conexión" under
   the game (about 35 MB are kept).
3. Share → Add to Home Screen. It then opens from its icon, full screen, without this computer.

Good to know:

- The game on the home screen keeps its own progress, apart from Safari's.
- After changing the game, `npm run phone` again and open it once on the wifi: the new build
  replaces the old one, and is the one played from the next opening on.
- On a phone the game takes the whole height (the home bar lies over its last pixels), with
  black at the sides since the screen is longer than the game's 3:2, and the
  browser's own double-tap gesture is called off (two quick touches take an order back).
- If the computer's address changes, the certificate is made again by itself; the phone goes on
  trusting it.
- The original sounds are Ogg Vorbis, which Safari decodes only from iOS 18.4; on older ones
  they are decoded by a decoder of ours (`?vorbis=own` tries it anywhere).
- `.certs/` and `public/icons/` are not committed. Whoever has the key in mkcert's folder
  (`mkcert -CAROOT`) could pose as any site to a phone that trusts it: keep it on this computer.
- Ours, outside the game: the "turn the phone" notice, the line that says how the keeping is
  going, and the margins that keep the game clear of the notch.

## Layout

- `tools/import-assets.mjs` — copies assets and converts the data XML to JSON.
- `src/data/` — typed loaders for resources, planes, gates, runways and levels.
- `src/game/sim/` — deterministic simulation, independent of rendering.
- `src/game/levelScene.ts` — PixiJS view, input and HUD.
- `tools/re/` — helpers for reading the disassembly (`prepare.sh`, `reidx.py`, `disf.py`, `args.py`,
  `gaps.py`, `audit.py`, `unused.py`), `stage_layout.py`, which runs a stage script in an
  emulator and lists what it builds, and `draw_trace.py`, which runs a draw routine and prints
  what it draws (both need `python3 -m venv .tools/venv && .tools/venv/bin/pip install unicorn`).
- `public/sw.js`, `tools/build-precache.mjs`, `tools/serve-https.mjs` — offline keeping and the HTTPS server for a phone.
- `tools/dev/play.mjs` — plays the first plane in a headless browser and takes screenshots.
- `tools/dev/shoot-level.mjs` — drives a plane that needs fuel through a level and takes screenshots.
- `tools/dev/play-all.mjs` — plays every level of the ten stages in order, buying improvements as the funds allow, and checks that each can be passed and that progress chains.
- `tools/dev/shoot-flow.mjs` — checks a finished level, its report, saved progress, the shop and the next level.
- `tools/dev/shoot-steps.mjs` — runs clicks, drags, waits and page scripts on any URL and captures where asked;
  `shoot-stage.mjs`, `shoot-clear.mjs`, `shoot-wash.mjs`, `type-name.mjs` and `early.mjs` set up one scene each
  (their first lines say how to call them).
