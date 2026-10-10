import { Container, Graphics, type Application, type Sprite, type FederatedPointerEvent } from 'pixi.js';
import type { GameData } from '../data/load';
import { findGoals, findLevel, type PlaneColor } from '../data/levels';
import type { Language, Strings } from '../data/strings';
import { loadFonts } from '../engine/fonts';
import { SCREEN_WIDTH } from '../engine/screen';
import type { AudioPlayer } from '../engine/audio';
import type { TextureStore } from '../engine/textures';
import { PRESIDENT_COLOR, paletteColor } from './palette';
import type { StageRules } from './progress';
import type { Settings } from './settings';
import { IMPROVEMENTS_FONTS, IMPROVEMENTS_SOUNDS, ImprovementsDialog, improvementsSurfaceIds } from './view/improvementsDialog';
import { LEVEL_INTRO_FONTS, LEVEL_INTRO_SURFACES, LevelIntro } from './view/levelIntro';
import { StageClear } from './view/stageClear';
import { GAME_MENU_SURFACES, GameMenu } from './view/gameMenu';
import { RunwayView, runwaySurfaceIds } from './view/runwayView';
import { SERVICE_SLOTS, SERVICE_TAB_SURFACES, ServiceTab, serviceGrip } from './view/serviceTab';
import { SKY_SURFACES, SkyView } from './view/sky';
import { BuoyLine, ringInterval, SeaSparkles, WATER_SURFACES, WaterRings } from './view/waterEffects';
import { PASSENGER_ICONS, PlaneView, planeSurfaceIds, type BalloonCorner, type Passenger } from './planeView';
import type { Progress } from './progress';
import { FINAL_REPORT_FONTS, FINAL_REPORT_SURFACES, FinalReport, tierFor } from './view/finalReport';
import { FloatingTexts, MAIN_FONT, SCORE_FONT } from './view/floatingText';
import { BONUS_SURFACES, BonusView } from './view/bonusView';
import { FOG_SURFACES, FogView } from './view/fogView';
import { ICE_SURFACES, IceView } from './view/iceView';
import { SAND_SURFACES, SandBrush, SandView } from './view/sandView';
import { LuggageView, luggageSurfaceIds } from './view/luggageView';
import { GasStationView, gasStationSurfaceIds } from './view/gasStationView';
import { GateView, gateSurfaceIds } from './view/gateView';
import { HUD_FONT, HUD_HEIGHT, HUD_SURFACES, Hud } from './view/hud';
import { ORDER_FLAG_SURFACES, OrderFlags } from './view/orderFlags';
import { PAINTING_SURFACES, PaintChooser, PaintingSign, SprayCan } from './view/paintingSpotView';
import { PlaneState, RULES } from './sim/rules';
import { Simulation, type Gate, type Hangar, type Plane, type SimEvent, type StopSpot } from './sim/simulation';
import type { StageLayout } from './stages/layout';

const tintOf = (color: PlaneColor | null): number => paletteColor(color).main;

const STEP = 1 / 60;

export interface LevelOptions {
  stage: number;
  level: number;
  layout: StageLayout;
  language: Language;
  progress: Progress;
  /** Navigation: a level number, or null for the stage screen. */
  onNavigate: (level: number | null) => void;
  onMainMenu: () => void;
  settings: Settings;
  /** The stage's rules for stars and rewards. */
  rules: StageRules;
  /** Skip the improvements shop before the level (used after a purchase rebuilds the airport). */
  skipShop?: boolean;
  /** Skip the announcement of the level, for automated checks. */
  skipIntro?: boolean;
  /** Asks for the level to be loaded again, straight into play. */
  onRebuild: () => void;
  /** Called when the player changes the options from the pause menu. */
  onSettings: (settings: Settings) => void;
  showNodes?: boolean;
}

export class LevelScene {
  readonly root = new Container();
  readonly sim: Simulation;

  private readonly ground = new Container();
  private readonly planeLayer = new Container();
  private readonly overlay = new Container();
  private readonly gateViews: { gate: Gate; view: GateView }[] = [];
  private readonly flags: OrderFlags;
  private sky: SkyView | null = null;
  private readonly runwayViews: RunwayView[] = [];
  private sparkles: SeaSparkles | null = null;
  private rings: WaterRings | null = null;
  private readonly buoys: BuoyLine[] = [];
  /** Per plane: where it was last frame and how long until its next ring on the water. */
  private readonly wakes = new Map<number, { x: number; y: number; next: number }>();
  private readonly stationViews: GasStationView[] = [];
  private readonly hangarPanels: { hangar: Hangar; panel: Container; ticks: Sprite[] }[] = [];
  private readonly planeViews = new Map<number, PlaneView>();
  private readonly floating = new FloatingTexts();
  private readonly hud: Hud;
  private accumulator = 0;
  private endShown = false;
  private paused = false;
  private readonly paintingSigns: PaintingSign[] = [];
  private readonly choosers = new Map<StopSpot, PaintChooser>();
  private readonly fading: PaintChooser[] = [];
  private readonly sprays: SprayCan[] = [];
  coffeeTab: ServiceTab | null = null;
  moviesTab: ServiceTab | null = null;
  private readonly bonusView: BonusView;
  private readonly fogViews: FogView[] = [];
  private readonly iceViews: IceView[] = [];
  private readonly sandViews: SandView[] = [];
  private readonly sandBrushes: SandBrush[] = [];
  private readonly luggageViews: LuggageView[] = [];
  /** The anti-fog machines' fans and the deicers' motors, by kind and runway number. */
  private readonly fans = new Map<string, ReturnType<AudioPlayer['loop']>>();
  /** The helicopter's engine while it crosses. */
  private rotor: ReturnType<AudioPlayer['loop']> = null;
  /** Seconds until each plane filling up may whistle. */
  private readonly whistles = new Map<number, number>();
  /** The colour chooser the finger went down on, until it is lifted. */
  heldChooser: PaintChooser | null = null;
  private dialog: Container | null = null;
  private report: FinalReport | null = null;

  private constructor(
    private readonly textures: TextureStore,
    private readonly audio: AudioPlayer,
    private readonly strings: Strings,
    private readonly options: LevelOptions,
    sim: Simulation,
  ) {
    this.sim = sim;
    this.hud = new Hud(textures, sim.goals);
    this.hud.onPause = () => this.openPause();
    // 0x12f90: each slot of the bar holds its service tab or, without the improvement, a filler.
    if (sim.movies) {
      this.moviesTab = new ServiceTab(textures, sim.movies, SERVICE_SLOTS.movies, { on: 'GUI.INGAMEGUI.IN_FLIGHT_MOVIES_ON', off: 'GUI.INGAMEGUI.IN_FLIGHT_MOVIES_OFF' });
      this.hud.behind.addChild(this.moviesTab);
    } else this.hud.behind.addChild(serviceGrip(textures, SERVICE_SLOTS.movies));
    if (sim.coffee) {
      this.coffeeTab = new ServiceTab(textures, sim.coffee, SERVICE_SLOTS.coffee, { on: 'GUI.INGAMEGUI.COFFEE_AND_CAKE_ON', off: 'GUI.INGAMEGUI.COFFEE_AND_CAKE_OFF' });
      this.hud.behind.addChild(this.coffeeTab);
    } else this.hud.behind.addChild(serviceGrip(textures, SERVICE_SLOTS.coffee));
    this.flags = new OrderFlags(textures);
    this.bonusView = new BonusView(textures, sim);
    this.root.addChild(this.ground, this.planeLayer, this.overlay, this.flags, this.bonusView, this.floating, this.hud);
    this.build();
  }

  static async create(app: Application, data: GameData, textures: TextureStore, audio: AudioPlayer, options: LevelOptions): Promise<LevelScene> {
    const { layout } = options;
    const stage = await data.stage(options.stage);
    const area = data.areas.get(options.stage);
    if (!area) throw new Error(`Unknown stage ${options.stage}`);
    // Owning the stage's plane licence switches every level to its extra-plane variant.
    const owned = options.progress.improvements(options.stage, options.level);
    const extraPlane = owned.has(layout.extraPlaneLicence);
    const schedule = findLevel(stage, options.level, extraPlane);
    const sim = new Simulation({
      layout,
      schedule,
      goals: findGoals(area, options.level, extraPlane),
      improvements: owned,
      planes: data.planes,
      gates: data.gates,
      runways: data.runways,
      gasStations: data.gasStations,
      luggages: data.luggages,
      hangars: data.hangars,
      level: options.level,
      screenWidth: SCREEN_WIDTH,
    });

    const ids = new Set<string>([...HUD_SURFACES, ...SERVICE_TAB_SURFACES, ...ORDER_FLAG_SURFACES, ...FINAL_REPORT_SURFACES, ...SKY_SURFACES, ...GAME_MENU_SURFACES, ...improvementsSurfaceIds(layout.improvements), ...LEVEL_INTRO_SURFACES, 'GUI.FINAL_REPORT.STAR_SMALL']);
    for (const layer of layout.backdrop.layers) {
      ids.add(layer.resource);
    }
    for (const id of [...layout.stopSpotSurfaces.normal, ...layout.stopSpotSurfaces.vip]) ids.add(id);
    for (const decoration of [...layout.decorations, ...layout.gateDecorations]) ids.add(decoration.resource);
    if (layout.water) for (const id of WATER_SURFACES) ids.add(id);
    if (sim.stopSpots.some((spot) => spot.painting)) for (const id of PAINTING_SURFACES) ids.add(id);
    if (sim.stopSpots.some((spot) => spot.wash)) ids.add('WASH_AND_GO.GRATING');
    if (sim.bonus) for (const id of BONUS_SURFACES[sim.bonus.kind]) ids.add(id);
    if (sim.hazardSchedule.some((h) => h.kind === 'fog')) for (const id of FOG_SURFACES) ids.add(id);
    sim.gates.forEach((gate) => {
      for (const id of gateSurfaceIds(gate, gate.letter.charCodeAt(0) - 65)) ids.add(id);
    });
    for (const station of sim.gasStations) for (const id of gasStationSurfaceIds(station)) ids.add(id);
    for (const luggage of sim.luggages) for (const id of luggageSurfaceIds(luggage)) ids.add(id);
    if (sim.hazardSchedule.some((h) => h.kind === 'ice')) for (const id of ICE_SURFACES) ids.add(id);
    if (sim.hazardSchedule.some((h) => h.kind === 'sand')) for (const id of SAND_SURFACES) ids.add(id);
    for (const hangar of sim.hangars) {
      ids.add(hangar.descriptor.surfaces.back);
      ids.add(hangar.descriptor.surfaces.front);
      ids.add('HANGARS.PROGRESS');
      ids.add('HANGARS.PROGRESS_TICK');
    }
    for (const runway of sim.runways) {
      for (const id of runwaySurfaceIds(runway)) ids.add(id);
    }
    for (const spawn of schedule.planes) {
      for (const id of planeSurfaceIds(data.planes.get(spawn.type)!, spawn.sex === 'FEMALE', layout.pontoons, spawn.passengers in PASSENGER_ICONS ? (spawn.passengers as Passenger) : null, spawn.needWash)) ids.add(id);
    }
    const [strings] = await Promise.all([
      data.strings(options.language),
      textures.load(ids),
      loadFonts(data.resources, [HUD_FONT, SCORE_FONT, MAIN_FONT, ...FINAL_REPORT_FONTS, ...IMPROVEMENTS_FONTS, ...LEVEL_INTRO_FONTS]),
    ]);

    const scene = new LevelScene(textures, audio, strings, options, sim);
    app.stage.addChild(scene.root);
    const levelMusic = (): void => audio.playMusic(`${area.music}.LOOP`, `${area.music}.INTRO`);
    // The shop comes before every level except the very first (`Level::start`, 0xfe8c), with its
    // own music. Music starts on the first press, once the browser allows audio.
    const shop = !options.skipShop && layout.improvements.length > 0 && !(options.stage === 1 && options.level === 1);
    // Then the level is announced with its goals (0x105bc) before it runs.
    const begin = (): void => {
      levelMusic();
      if (!options.skipIntro) scene.openIntro();
    };
    if (shop) {
      audio.playMusic('MUSICS.SHOPPING');
      scene.openShop(begin);
    } else begin();
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', (event: FederatedPointerEvent) => scene.press(event.global.x, event.global.y));
    // The colour chooser of a painting spot follows the finger while it is held down.
    app.stage.on('globalpointermove', (event: FederatedPointerEvent) => scene.heldChooser?.move(event.global.y));
    const release = (event: FederatedPointerEvent): void => {
      scene.heldChooser?.release(event.global.y);
      scene.heldChooser = null;
      if (scene.coffeeTab) scene.coffeeTab.held = false;
      if (scene.moviesTab) scene.moviesTab.held = false;
    };
    app.stage.on('pointerup', release);
    app.stage.on('pointerupoutside', release);
    app.ticker.add((ticker) => scene.frame(ticker.deltaMS / 1000));
    return scene;
  }

  press(x: number, y: number): void {
    const first = !this.audio.unlocked;
    this.audio.unlock();
    // With the pause menu up, touches belong to it.
    if (this.dialog) return;
    if (this.coffeeTab?.contains(x, y) && !this.paused) {
      this.coffeeTab.held = true;
      this.sim.serveCoffee();
      return;
    }
    if (this.moviesTab?.contains(x, y) && !this.paused) {
      this.moviesTab.held = true;
      this.sim.showMovies();
      return;
    }
    // Balloons and the helicopter are on top of everything, the bar included, and take the
    // touch first.
    if (!this.paused && this.sim.tapBonus(x, y)) return;
    if (this.hud.contains(y)) return;
    if (first) {
      this.audio.preload(['SOUNDS.SELECT_PLANE', 'SOUNDS.PLACE_CLICK', 'SOUNDS.FORBIDDEN_CLICK', 'SOUNDS.QUEUE_CANCEL', 'SOUNDS.BONUS_X2', 'SOUNDS.CASH']);
      for (const plane of new Set(this.sim.planes.map((p) => p.descriptor))) this.audio.preload(Object.values(plane.sounds).filter((id) => !id.includes('%')));
    }
    const chooser = this.paused ? undefined : [...this.choosers.values()].find((c) => c.contains(x, y));
    if (chooser) {
      this.heldChooser = chooser;
      chooser.press(y);
      return;
    }
    this.sim.press(x, y);
  }

  /**
   * Which way a plane's balloons hang: the stage scripts give every place a corner, which the
   * plane takes on while it is there (0x75f0). Gates, the pump and the hangar use 1, stop spots
   * and runways the stage's own values; a plane not yet anywhere keeps 3.
   */
  private balloonCorner(plane: Plane): BalloonCorner {
    const place = plane.place;
    if (!place) return 3;
    if (place.kind === 'runway') return this.options.layout.runwayBalloonCorner;
    return place.kind === 'stopSpot' ? (this.options.layout.stopSpotBalloonCorner ?? 0) : 1;
  }

  /**
   * Image for the thought cloud: the one the place the plane goes to next was built with
   * (`place+0xc`, loaded as `INDICATORS.THOUGHT_ICONS.<n>` by 0x6abc8). Runways use their number
   * less one, gates 5 onwards by letter, the gas station 10, the hangar 11, a stop spot 12, the
   * wash and go 13, the luggage conveyor 14 and the painting stop spot 15.
   */
  private destinationIcon(plane: Plane): number {
    const next = plane.queue[0]!;
    if (next.kind === 'runway') return next.number - 1;
    if (next.kind === 'gate') return 5 + next.letter.charCodeAt(0) - 'A'.charCodeAt(0);
    if (next.kind === 'gasStation') return 10;
    if (next.kind === 'hangar') return 11;
    if (next.kind === 'luggage') return 14;
    return next.painting ? 15 : next.wash ? 13 : 12;
  }

  /** The improvements shop for this level; a purchase or sale means building the airport again. */
  private openIntro(): void {
    const { stage, level, progress } = this.options;
    this.paused = true;
    const intro = new LevelIntro(this.textures, this.strings, { stage, number: level, goals: this.sim.goals, best: progress.result(stage, level).best }, () => {
      this.audio.unlock();
      this.dialog = null;
      this.paused = false;
      setTimeout(() => intro.destroy({ children: true }));
    });
    this.dialog = intro;
    this.root.addChild(intro);
  }

  private openShop(onLeave: () => void): void {
    const { progress, stage, level, layout } = this.options;
    this.paused = true;
    this.audio.preload(IMPROVEMENTS_SOUNDS);
    const shop = new ImprovementsDialog(this.textures, this.audio, this.strings, progress, stage, level, layout.improvements, () => {
      if (shop.changed) return this.options.onRebuild();
      this.dialog = null;
      this.paused = false;
      onLeave();
      setTimeout(() => shop.destroy({ children: true }));
    });
    this.dialog = shop;
    this.root.addChild(shop);
  }

  /** The menu button: stops the game and opens the original's menu dialog. */
  private openPause(): void {
    if (this.dialog || this.endShown) return;
    this.audio.unlock();
    this.paused = true;
    const menu = new GameMenu(this.textures, this.audio, {
      strings: this.strings,
      settings: this.options.settings,
      inGame: true,
      onSettings: (next) => {
        this.options.settings = next;
        this.options.onSettings(next);
      },
      onExit: (how) => {
        if (how === 'restart') return this.options.onNavigate(this.options.level);
        if (how === 'map') return this.options.onNavigate(null);
        if (how === 'mainMenu') return this.options.onMainMenu();
        this.dialog = null;
        this.paused = false;
        setTimeout(() => menu.destroy({ children: true }));
      },
    });
    this.dialog = menu;
    this.root.addChild(menu);
  }

  /** The plane says what it needs, in the voice of its mood (0x5bd4). */
  private speak(plane: Plane): void {
    // Content or merely impatient it makes its "cannot" sound; upset or furious it complains.
    this.planeSound(plane, plane.energy < 0.3 ? 'TalkMad' : plane.energy < 0.5 ? 'TalkUpset' : 'Cannot');
    this.planeViews.get(plane.id)?.speak(plane.need);
  }

  /** A plane's own sound: descriptor slot, with `%s` filled by its sex and its voice pitch. */
  private planeSound(plane: Plane, slot: string): void {
    const pattern = plane.descriptor.sounds[slot];
    if (!pattern) return;
    const voiced = pattern.includes('%s');
    const pitch = voiced ? (plane.sex === 'MALE' ? plane.descriptor.pitch.male : plane.descriptor.pitch.female) : 1;
    this.audio.play(pattern.replace('%s', plane.sex), { pitch });
    if (voiced) this.planeViews.get(plane.id)?.talk();
  }

  /** Advances the simulation in fixed steps and redraws. */
  frame(seconds: number): void {
    if (!this.paused) this.accumulator += Math.min(seconds, 0.25);
    while (this.accumulator >= STEP) {
      this.sim.update(STEP);
      this.accumulator -= STEP;
      for (const event of this.sim.drainEvents()) this.onEvent(event);
    }
    for (const event of this.sim.drainEvents()) this.onEvent(event);
    this.draw(seconds);
  }

  private build(): void {
    const { layout } = this.options;
    const { horizon, layers } = layout.backdrop;
    if (layout.backdrop.sky !== null) {
      this.sky = new SkyView(this.textures, layout.backdrop.sky, horizon);
      this.ground.addChild(this.sky);
    }

    layers.forEach((layer, index) => {
      const sprite = this.textures.sprite(layer.resource);
      sprite.position.copyFrom(layer.position);
      if (layer.scale) sprite.scale.copyFrom(layer.scale);
      this.ground.addChild(sprite);
      const sparkles = layout.backdrop.sparkles;
      if (sparkles?.afterLayer === index) {
        this.sparkles = new SeaSparkles(this.textures, sparkles.area);
        this.ground.addChild(this.sparkles);
      }
    });
    if (layout.water) {
      this.rings = new WaterRings(this.textures);
      this.ground.addChild(this.rings);
    }

    for (const runway of this.sim.runways) {
      const view = new RunwayView(this.textures, runway);
      this.runwayViews.push(view);
      if (this.sim.hazardSchedule.some((h) => h.kind === 'ice')) {
        const ice = new IceView(this.textures, runway);
        this.iceViews.push(ice);
        this.ground.addChild(ice);
      }
      if (this.sim.hazardSchedule.some((h) => h.kind === 'fog')) {
        const fog = new FogView(this.textures, runway, layout.spaceGas === true);
        this.fogViews.push(fog);
        this.planeLayer.addChild(fog);
      }
      if (this.sim.hazardSchedule.some((h) => h.kind === 'sand')) {
        const sand = new SandView(this.textures, runway);
        this.sandViews.push(sand);
        this.planeLayer.addChild(sand);
        this.sandBrushes.push(new SandBrush(this.textures, runway, this.planeLayer));
      }
      // A water runway lies between two lines of buoys, set relative to it by the stage script (0xcf370).
      const buoys = layout.water
        ? [new BuoyLine(this.textures, runway.position.x - 186, runway.position.y - 27), new BuoyLine(this.textures, runway.position.x - 166, runway.position.y + 6)]
        : [];
      this.buoys.push(...buoys);
      if (buoys[0]) this.ground.addChild(buoys[0]);
      this.ground.addChild(view);
      if (buoys[1]) this.ground.addChild(buoys[1]);
    }
    for (const spot of this.sim.stopSpots) {
      // The wash and go's own draw (0x853b4) is its grating on the ground.
      for (const id of spot.wash ? ['WASH_AND_GO.GRATING'] : spot.vip ? layout.stopSpotSurfaces.vip : layout.stopSpotSurfaces.normal) {
        const sprite = this.textures.sprite(id);
        sprite.position.copyFrom(spot.position);
        this.ground.addChild(sprite);
      }
      if (spot.painting) {
        const sign = new PaintingSign(this.textures, spot, layout.water);
        this.paintingSigns.push(sign);
        this.planeLayer.addChild(sign);
      }
    }
    for (const gate of this.sim.gates) {
      for (const extra of layout.gateDecorations) {
        const sprite = this.textures.sprite(extra.resource);
        sprite.position.set(gate.position.x + extra.offset.x, gate.position.y + extra.offset.y);
        if (extra.depth === undefined) this.ground.addChild(sprite);
        else {
          // Sorted with the planes; the half pixel puts it over a plane docked at the same depth.
          sprite.zIndex = gate.position.y + extra.depth + 0.5;
          this.planeLayer.addChild(sprite);
        }
      }
      const view = new GateView(this.textures, gate, gate.letter.charCodeAt(0) - 65);
      // The airport keeps its objects sorted by depth (0x1238c), and a gate's is its own line
      // plus the descriptor's DespZ (0x43094): a plane docked at it stands lower and is drawn over.
      view.zIndex = gate.position.y + gate.descriptor.depthOffset;
      this.planeLayer.addChild(view);
      this.gateViews.push({ gate, view });
    }
    for (const hangar of this.sim.hangars) {
      // The plane goes in between the two halves: back under the planes, front over them.
      const back = this.textures.sprite(hangar.descriptor.surfaces.back);
      back.position.copyFrom(hangar.position);
      const front = this.textures.sprite(hangar.descriptor.surfaces.front);
      front.position.copyFrom(hangar.position);
      // Checklist shown while a plane is serviced (0x47710): a panel and four ticks down it.
      const panel = new Container();
      panel.position.set(hangar.position.x + 34, hangar.position.y + 20);
      panel.addChild(this.textures.sprite('HANGARS.PROGRESS'));
      const ticks = [0, 1, 2, 3].map((i) => {
        const tick = this.textures.sprite('HANGARS.PROGRESS_TICK');
        tick.position.set(-9 + 2 * i, -10 + 7 * i);
        panel.addChild(tick);
        return tick;
      });
      this.ground.addChild(back);
      this.overlay.addChild(front, panel);
      this.hangarPanels.push({ hangar, panel, ticks });
    }
    for (const station of this.sim.gasStations) {
      const view = new GasStationView(this.textures, station);
      this.ground.addChild(view);
      this.stationViews.push(view);
    }
    for (const luggage of this.sim.luggages) {
      const view = new LuggageView(this.textures, luggage);
      this.ground.addChild(view);
      this.luggageViews.push(view);
    }
    for (const decoration of layout.decorations) {
      const sprite = this.textures.sprite(decoration.resource);
      sprite.position.copyFrom(decoration.position);
      if (decoration.depth === undefined) this.overlay.addChild(sprite);
      else {
        sprite.zIndex = decoration.depth;
        this.planeLayer.addChild(sprite);
      }
    }

    if (this.options.showNodes) {
      const marks = new Graphics();
      for (const node of this.sim.graph.nodes) {
        for (const other of node.links) {
          if (node.id < other.id) marks.moveTo(node.x, node.y).lineTo(other.x, other.y);
        }
      }
      marks.stroke({ color: 0xffffff, width: 1, alpha: 0.35 });
      for (const node of this.sim.graph.nodes) marks.circle(node.x, node.y, 2).fill(node.terminal ? 0xff3030 : 0xffff00);
      this.overlay.addChild(marks);
    }

  }

  private onEvent(event: SimEvent): void {
    this.playEvent(event);
    switch (event.type) {
      case 'score':
        if (event.points > 0) this.float(String(event.points), event.plane, 'score', -30);
        else if (event.points < 0) this.float(String(event.points), event.plane, 'penalty', -30);
        // The bonus text sits where the original puts it, 50 px above the plane.
        if (event.multiplier > 1) this.float(this.strings.t('IN_GAME.BONUS_X', event.multiplier), event.plane, 'message', -66);
        break;
      case 'punctuality':
        this.float(this.strings.t(`IN_GAME.${event.result}`), event.plane, 'message', -50);
        break;
      case 'queueCancelled':
        this.float(this.strings.t('IN_GAME.QUEUE_CANCELED'), event.plane, 'message', -50);
        break;
      default:
        break;
    }
  }

  /** Sounds the original plays at the same points (ids confirmed in the binary where noted in docs). */
  private playEvent(event: SimEvent): void {
    switch (event.type) {
      case 'spawn':
        this.planeSound(event.plane, 'In');
        break;
      case 'select':
        this.audio.play('SOUNDS.SELECT_PLANE');
        break;
      case 'order':
        this.audio.play('SOUNDS.PLACE_CLICK');
        break;
      case 'forbidden':
        this.audio.play('SOUNDS.FORBIDDEN_CLICK');
        // Sent somewhere it cannot go while it has nothing else to do, the plane says what it
        // needs (0x5b10).
        if (event.plane && event.plane.queue.length === 0 && (event.plane.state === PlaneState.FLYING || event.plane.state === PlaneState.WAITING)) this.speak(event.plane);
        break;
      case 'queueCancelled':
        this.audio.play('SOUNDS.QUEUE_CANCEL');
        // 0x7a08: it says what it needs, and its "cannot" sound follows.
        this.speak(event.plane);
        this.planeSound(event.plane, 'Cannot');
        break;
      case 'landingStarted':
        this.planeSound(event.plane, 'GoingOut');
        break;
      case 'landingApproach':
        this.planeSound(event.plane, 'Landing');
        break;
      case 'touchdown':
        this.planeSound(event.plane, 'TouchingLand');
        break;
      case 'serviceStarted':
        this.planeSound(event.plane, event.service === 'unloading' ? 'Unloading' : 'Loading');
        break;
      case 'takeOff':
        this.planeSound(event.plane, 'Launching');
        break;
      case 'fuelingStarted':
        this.audio.play('SOUNDS.FUELING');
        // 0x6764: it may whistle three to eight seconds into the fill-up.
        this.whistles.set(event.plane.id, 3 + Math.random() * 5);
        break;
      case 'timeOver':
        this.audio.play('SOUNDS.TIME_OVER');
        break;
      case 'balloonPopped':
        // 0x22150: the pop is pitched a little differently each time.
        this.audio.play('SOUNDS.BALLOON_POP', { pitch: 0.98 + Math.random() * 0.04 });
        this.bonusView.splash(event.x, event.y);
        break;
      case 'coinReleased':
        this.audio.play('SOUNDS.COIN_RELEASE');
        break;
      case 'helicopterArrived':
        // 0x49568: its engine at half volume, heard from the side it is on.
        this.rotor = this.audio.loop('SOUNDS.HELICOPTER_LOOP', 0.5);
        break;
      case 'helicopterLeft':
        this.rotor?.stop(0.5);
        this.rotor = null;
        break;
      case 'bonusPaid':
        this.audio.play('SOUNDS.CASH');
        this.floating.show(String(event.amount), event.x, event.y, 'score');
        break;
      case 'coffeeReady':
        this.audio.play('SOUNDS.CAKE_AND_COFFEE_READY');
        break;
      case 'coffeeServed':
        this.audio.play('SOUNDS.CAKE_AND_COFFEE');
        break;
      case 'moviesReady':
        this.audio.play('SOUNDS.IN_FLIGHT_MOVIES_READY');
        break;
      case 'moviesShown':
        this.audio.play('SOUNDS.IN_FLIGHT_MOVIES');
        break;
      case 'washStarted':
        this.audio.play('SOUNDS.WASHING');
        break;
      case 'luggageStarted':
        this.audio.play(event.luggage.descriptor.sound);
        break;
      case 'hazardAppeared':
        if (event.kind === 'ice') this.audio.play('SOUNDS.RUNWAY_FREEZING');
        else if (event.kind === 'sand') this.audio.play('SOUNDS.SAND_APPEARS');
        break;
      case 'hazardMachine':
        // The brush plays its sound once (0x1a1ca); the other two machines hum while they work.
        if (event.kind === 'sand') this.audio.play('SOUNDS.ANTI_SAND');
        else
          this.fans.set(`${event.kind}-${event.runway.number}`, this.audio.loop(event.kind === 'fog' ? 'SOUNDS.ANTI_FOG_SYSTEM_FAN' : 'SOUNDS.DE_ICER_WORKING'));
        break;
      case 'hazardLifted': {
        const key = `${event.kind}-${event.runway.number}`;
        this.fans.get(key)?.stop(0.5);
        this.fans.delete(key);
        if (event.byMachine && event.kind !== 'sand') this.audio.play('SOUNDS.ANTI_FOG_DEICER_FINISH');
        break;
      }
      case 'paintingReady':
        this.audio.play('SOUNDS.PAINTING_READY');
        break;
      case 'paintingStarted': {
        this.audio.play('SOUNDS.PAINTING');
        const spray = new SprayCan(this.textures, event.plane, event.color, this.options.layout.water, RULES.painting.duration);
        this.sprays.push(spray);
        this.planeLayer.addChild(spray);
        break;
      }
      case 'repainted':
        this.planeViews.get(event.plane.id)?.repaint(paletteColor(event.plane.color));
        break;
      case 'serviceStartedAtHangar':
        this.audio.play('SOUNDS.REPAIRING_START');
        break;
      case 'leftAngry':
        this.planeSound(event.plane, 'Out');
        break;
      case 'score':
        // Every award and penalty rings the till (0x5d2c, 0x5de0).
        this.audio.play('SOUNDS.CASH');
        if (event.multiplier > 1) this.audio.play(`SOUNDS.BONUS_X${event.multiplier}`);
        break;
      default:
        break;
    }
  }

  private float(label: string, plane: Plane, style: 'score' | 'penalty' | 'message', offsetY: number): void {
    // Keep the text on screen for planes near the edges or still above the HUD.
    const x = Math.max(40, Math.min(SCREEN_WIDTH - 40, plane.x));
    const y = Math.max(HUD_HEIGHT + 12, plane.y - plane.altitude + offsetY);
    this.floating.show(label, x, y, style);
  }

  private draw(seconds: number): void {
    for (const { gate, view } of this.gateViews) view.update(this.paused ? 0 : seconds, gate.lastColor ? tintOf(gate.lastColor) : this.options.layout.neutralColor);
    this.report?.update(seconds);
    const elapsed = this.paused ? 0 : seconds;
    this.sky?.update(elapsed);
    this.sparkles?.update(elapsed);
    this.rings?.update(elapsed);
    this.drawPainting(elapsed);
    this.bonusView.update(elapsed);
    for (const fog of this.fogViews) fog.update(elapsed);
    for (const ice of this.iceViews) ice.update(elapsed);
    for (const sand of this.sandViews) sand.update();
    for (const brush of this.sandBrushes) brush.update(elapsed);
    for (const luggage of this.luggageViews) luggage.update(elapsed);
    if (this.sim.helicopter) this.rotor?.pan((this.sim.helicopter.x - 240) / 240);
    this.updateWhistles(elapsed);
    this.coffeeTab?.update(elapsed);
    this.moviesTab?.update(elapsed);
    for (const line of this.buoys) line.update(elapsed);
    for (const view of this.stationViews) view.update();
    for (const view of this.runwayViews) view.update(elapsed);
    for (const { hangar, panel, ticks } of this.hangarPanels) {
      const plane = hangar.plane;
      panel.visible = hangar.use === 'working' && plane !== null;
      if (!panel.visible || !plane) continue;
      ticks.forEach((tick, i) => {
        // A tick lands at each quarter of the job and pops in with a wobble.
        const since = hangar.progress * 4 - (plane.descriptor.times.servicing - 1) * (i + 1);
        tick.visible = since >= 0;
        const t = since * 2;
        tick.scale.set(since < 0.5 ? t * (Math.sin(t * Math.PI * 4) + 1) * (1 - t) + t : 1);
      });
    }
    const selected = this.sim.selected;
    this.flags.update(selected, selected ? tintOf(selected.color) : 0xffffff);

    for (const plane of this.sim.planes) {
      let view = this.planeViews.get(plane.id);
      if (plane.gone) {
        this.wakes.delete(plane.id);
        if (view) {
          view.destroy({ children: true });
          this.planeViews.delete(plane.id);
        }
        continue;
      }
      if (!view) {
        view = new PlaneView(this.textures, plane.descriptor, plane.passenger === 'PRESIDENT' ? PRESIDENT_COLOR : paletteColor(plane.color), plane.sex === 'FEMALE', this.options.layout.pontoons, !plane.washDone);
        this.planeLayer.addChild(view);
        this.planeViews.set(plane.id, view);
      }
      // While it is being serviced the plane sits inside the hangar, behind its front half. The
      // original walks it in; here it is simply drawn at the building's centre.
      const inside = plane.state === PlaneState.IN_HANGAR && plane.place?.kind === 'hangar' ? plane.place : null;
      if (inside) view.position.set(inside.position.x, inside.position.y + 8);
      else view.position.set(plane.x, plane.y);
      view.zIndex = plane.altitude > 0 ? 10000 : plane.y;
      if (this.rings && elapsed > 0) {
        // On the water a plane leaves rings, the faster it moves the closer together (0x6cb2).
        const wake = this.wakes.get(plane.id) ?? { x: plane.x, y: plane.y, next: 0 };
        const speed = Math.hypot(plane.x - wake.x, plane.y - wake.y) / elapsed;
        wake.x = plane.x;
        wake.y = plane.y;
        if (plane.altitude < 1 && !inside) {
          wake.next -= elapsed;
          if (wake.next < 0) {
            wake.next += ringInterval(speed);
            this.rings.add(plane.x, plane.y);
          }
        }
        this.wakes.set(plane.id, wake);
      }
      const draining = plane.state === PlaneState.FLYING || plane.state === PlaneState.WAITING;
      // On the ground with nothing to do, the balloon shows what the plane wants next (0x874e).
      const idle = plane.state === PlaneState.WAITING && plane.queue.length === 0;
      view.update(seconds, {
        heading: plane.heading,
        altitude: plane.altitude,
        scale: plane.scale,
        selected: plane.selected,
        energy: plane.energy,
        need: idle ? plane.need : null,
        thought: draining && plane.queue.length > 0 ? this.destinationIcon(plane) : null,
        corner: this.balloonCorner(plane),
        passenger: plane.passenger,
        dirty: !plane.washDone,
        pitch: plane.pitch,
        idle: plane.state === PlaneState.WAITING && plane.queue.length === 0,
        gearDown: this.gearDown(plane),
      });
    }
    this.planeLayer.sortableChildren = true;

    this.floating.update(seconds);

    const remaining = this.sim.totalTime > 0 ? Math.max(0, this.sim.totalTime - this.sim.time) / this.sim.totalTime : 0;
    this.hud.update(this.sim.score, remaining, this.paused ? 0 : seconds);

    if (this.sim.ended && !this.endShown) this.showEnd();
  }

  /** Painting stop spots: the sign, the colour chooser beside a parked plane and the spray cans. */
  private drawPainting(elapsed: number): void {
    for (const sign of this.paintingSigns) sign.update(elapsed);
    for (const spot of this.sim.stopSpots) {
      if (!spot.painting) continue;
      const colors = this.sim.paintOptions(spot);
      const chooser = this.choosers.get(spot);
      if (colors.length > 0 && !chooser) {
        const created = new PaintChooser(this.textures, spot, colors, (color) => this.sim.paint(spot, color));
        this.choosers.set(spot, created);
        this.planeLayer.addChild(created);
      } else if (colors.length === 0 && chooser) {
        // The plane is being painted or has left: the chooser fades away (0x67f36, 0x680b4).
        chooser.closing = true;
        if (this.heldChooser === chooser) this.heldChooser = null;
        this.choosers.delete(spot);
        this.fading.push(chooser);
      }
    }
    for (const chooser of this.choosers.values()) chooser.update(elapsed);
    for (const list of [this.fading, this.sprays]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i]!;
        if (item.update(elapsed)) continue;
        list.splice(i, 1);
        item.destroy({ children: true });
      }
    }
  }

  /**
   * A plane filling up whistles once when its wait is over, if it is content (energy above a
   * half) and its mouth is not busy (0x7e5c).
   */
  private updateWhistles(elapsed: number): void {
    for (const [id, left] of this.whistles) {
      const plane = this.sim.planes.find((p) => p.id === id);
      if (!plane || plane.gone || plane.state !== PlaneState.FUELING) {
        this.whistles.delete(id);
        continue;
      }
      const now = left - elapsed;
      this.whistles.set(id, now);
      const view = this.planeViews.get(id);
      if (now >= 0 || !view || !view.mouthFree || plane.energy <= 0.5) continue;
      this.planeSound(plane, Math.random() < 0.5 ? 'Whistle1' : 'Whistle2');
      view.whistle();
      this.whistles.delete(id);
    }
  }

  /**
   * The gear is up in the air. On the way down it comes out when little of the glide is left
   * (`plane+0x250`, 0x80a2).
   */
  private gearDown(plane: Plane): boolean {
    if (plane.state === PlaneState.FLYING || plane.state === PlaneState.AIRBORNE) return false;
    const approach = plane.approach;
    if (!approach) return true;
    if (approach.phase === 0) return false;
    if (approach.phase !== 2) return true;
    return ((1 - approach.time) * RULES.landing.glideDistance) / RULES.landingSpeed < RULES.landing.gearTime;
  }

  private showEnd(): void {
    this.endShown = true;
    const tier = tierFor(this.sim.score, this.sim.goals);
    this.audio.playMusic(`MUSICS.FINAL_REPORT.${tier}`);
    this.audio.play(`SOUNDS.FINAL_REPORT.${tier}`);
    const { progress, stage, level, onNavigate } = this.options;
    const stars = ['FAIL', 'GOAL', 'EXPERT', 'MASTER', 'SUPREME', 'PERFECT'].indexOf(tier);
    const cleared = progress.complete(stage, level, this.sim.score, stars);
    const report = new FinalReport(this.textures, this.audio, this.strings, this.sim);
    // The original report only offers to go on: to the stage's reward if this pass cleared it,
    // then back to the map.
    report.onContinue = () => {
      if (!cleared) return onNavigate(null);
      const rules = this.options.rules;
      const summary = new StageClear(this.textures, this.audio, this.strings, { bonus: rules.clearBonus, stars: progress.stageStars(stage), funds: progress.stageReward(stage) }, () => onNavigate(null));
      this.root.addChild(summary);
      setTimeout(() => report.destroy({ children: true }));
      this.report = null;
    };
    this.root.addChild(report);
    this.report = report;
  }
}
