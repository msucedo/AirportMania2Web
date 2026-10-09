import { Container, Graphics, type Application, type Sprite, type FederatedPointerEvent } from 'pixi.js';
import type { GameData } from '../data/load';
import { findGoals, findLevel, type PlaneColor } from '../data/levels';
import type { Language, Strings } from '../data/strings';
import { loadFonts } from '../engine/fonts';
import { SCREEN_WIDTH } from '../engine/screen';
import type { AudioPlayer } from '../engine/audio';
import type { TextureStore } from '../engine/textures';
import { paletteColor } from './palette';
import type { StageRules } from './progress';
import type { Settings } from './settings';
import { IMPROVEMENTS_FONTS, IMPROVEMENTS_SOUNDS, ImprovementsDialog, improvementsSurfaceIds } from './view/improvementsDialog';
import { StageClear } from './view/stageClear';
import { GAME_MENU_SURFACES, GameMenu } from './view/gameMenu';
import { RunwayView, runwaySurfaceIds } from './view/runwayView';
import { SKY_SURFACES, SkyView } from './view/sky';
import { BuoyLine, ringInterval, SeaSparkles, WATER_SURFACES, WaterRings } from './view/waterEffects';
import { PlaneView, planeSurfaceIds } from './planeView';
import type { Progress } from './progress';
import { FINAL_REPORT_FONTS, FINAL_REPORT_SURFACES, FinalReport, tierFor } from './view/finalReport';
import { FloatingTexts, MAIN_FONT, SCORE_FONT } from './view/floatingText';
import { GasStationView, gasStationSurfaceIds } from './view/gasStationView';
import { GateView, gateSurfaceIds } from './view/gateView';
import { HUD_FONT, HUD_HEIGHT, HUD_SURFACES, Hud } from './view/hud';
import { ORDER_FLAG_SURFACES, OrderFlags } from './view/orderFlags';
import { PlaneState } from './sim/rules';
import { Simulation, type Gate, type Hangar, type Plane, type SimEvent } from './sim/simulation';
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
  private sky!: SkyView;
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
    this.flags = new OrderFlags(textures);
    this.root.addChild(this.ground, this.planeLayer, this.overlay, this.flags, this.floating, this.hud);
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
      hangars: data.hangars,
      level: options.level,
      screenWidth: SCREEN_WIDTH,
    });

    const ids = new Set<string>([...HUD_SURFACES, ...ORDER_FLAG_SURFACES, ...FINAL_REPORT_SURFACES, ...SKY_SURFACES, ...GAME_MENU_SURFACES, ...improvementsSurfaceIds(layout.improvements), 'GUI.FINAL_REPORT.STAR_SMALL']);
    for (const layer of layout.backdrop.layers) {
      ids.add(layer.resource);
    }
    for (const id of [...layout.stopSpotSurfaces.normal, ...layout.stopSpotSurfaces.vip]) ids.add(id);
    for (const decoration of [...layout.decorations, ...layout.gateDecorations]) ids.add(decoration.resource);
    if (layout.water) for (const id of WATER_SURFACES) ids.add(id);
    sim.gates.forEach((gate) => {
      for (const id of gateSurfaceIds(gate, gate.letter.charCodeAt(0) - 65)) ids.add(id);
    });
    for (const station of sim.gasStations) for (const id of gasStationSurfaceIds(station)) ids.add(id);
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
      for (const id of planeSurfaceIds(data.planes.get(spawn.type)!, spawn.sex === 'FEMALE', layout.pontoons)) ids.add(id);
    }
    const [strings] = await Promise.all([
      data.strings(options.language),
      textures.load(ids),
      loadFonts(data.resources, [HUD_FONT, SCORE_FONT, MAIN_FONT, ...FINAL_REPORT_FONTS, ...IMPROVEMENTS_FONTS]),
    ]);

    const scene = new LevelScene(textures, audio, strings, options, sim);
    app.stage.addChild(scene.root);
    // The shop comes before the level whenever there is money to spend or something to sell.
    const record = options.progress.record(options.stage, options.level);
    if (!options.skipShop && layout.improvements.length > 0 && (record.funds > 0 || record.improvements.length > 0)) scene.openShop();
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', (event: FederatedPointerEvent) => scene.press(event.global.x, event.global.y));
    // The level music starts on the first press, once the browser allows audio.
    audio.playMusic(`${area.music}.LOOP`, `${area.music}.INTRO`);
    app.ticker.add((ticker) => scene.frame(ticker.deltaMS / 1000));
    return scene;
  }

  press(x: number, y: number): void {
    const first = !this.audio.unlocked;
    this.audio.unlock();
    // With the pause menu up, touches belong to it.
    if (this.hud.contains(y) || this.dialog) return;
    if (first) {
      this.audio.preload(['SOUNDS.SELECT_PLANE', 'SOUNDS.PLACE_CLICK', 'SOUNDS.FORBIDDEN_CLICK', 'SOUNDS.QUEUE_CANCEL', 'SOUNDS.BONUS_X2']);
      for (const plane of new Set(this.sim.planes.map((p) => p.descriptor))) this.audio.preload(Object.values(plane.sounds).filter((id) => !id.includes('%')));
    }
    this.sim.press(x, y);
  }

  /** The improvements shop for this level; a purchase or sale means building the airport again. */
  private openShop(): void {
    const { progress, stage, level, layout } = this.options;
    this.paused = true;
    this.audio.preload(IMPROVEMENTS_SOUNDS);
    const shop = new ImprovementsDialog(this.textures, this.audio, this.strings, progress, stage, level, layout.improvements, () => {
      if (shop.changed) return this.options.onRebuild();
      this.dialog = null;
      this.paused = false;
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
    this.sky = new SkyView(this.textures, layout.backdrop.sky, horizon);
    this.ground.addChild(this.sky);

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
      for (const id of spot.vip ? layout.stopSpotSurfaces.vip : layout.stopSpotSurfaces.normal) {
        const sprite = this.textures.sprite(id);
        sprite.position.copyFrom(spot.position);
        this.ground.addChild(sprite);
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
      this.ground.addChild(view);
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
    for (const decoration of layout.decorations) {
      const sprite = this.textures.sprite(decoration.resource);
      sprite.position.copyFrom(decoration.position);
      this.overlay.addChild(sprite);
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
        break;
      case 'queueCancelled':
        this.audio.play('SOUNDS.QUEUE_CANCEL');
        break;
      case 'landed':
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
        break;
      case 'serviceStartedAtHangar':
        this.audio.play('SOUNDS.REPAIRING_START');
        break;
      case 'leftAngry':
        this.planeSound(event.plane, 'Out');
        break;
      case 'score':
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
    this.sky.update(elapsed);
    this.sparkles?.update(elapsed);
    this.rings?.update(elapsed);
    for (const line of this.buoys) line.update(elapsed);
    for (const view of this.stationViews) view.update();
    for (const view of this.runwayViews) view.update();
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
        view = new PlaneView(this.textures, plane.descriptor, paletteColor(plane.color), plane.sex === 'FEMALE', this.options.layout.pontoons);
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
      // The bubble shows what the plane wants next while it has no orders (0x5f28).
      const idle = draining && !plane.landing && plane.queue.length === 0;
      view.update(seconds, {
        heading: plane.heading,
        altitude: plane.altitude,
        scale: plane.scale,
        selected: plane.selected,
        energy: plane.energy,
        need: idle ? plane.need : null,
        idle: plane.state === PlaneState.WAITING && plane.queue.length === 0,
        gearDown: plane.state !== PlaneState.AIRBORNE && (plane.state !== PlaneState.FLYING || plane.landing),
      });
    }
    this.planeLayer.sortableChildren = true;

    this.floating.update(seconds);

    const remaining = Math.max(0, Math.ceil(this.sim.totalTime - this.sim.time));
    this.hud.update(this.sim.score, remaining, this.paused ? 0 : seconds);

    if (this.sim.ended && !this.endShown) this.showEnd();
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
