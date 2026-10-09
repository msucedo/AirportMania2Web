import { Container, Graphics, Sprite, type Application, type FederatedPointerEvent } from 'pixi.js';
import type { GameData } from '../data/load';
import { findGoals, findLevel, type PlaneColor } from '../data/levels';
import type { Language, Strings } from '../data/strings';
import { loadFonts } from '../engine/fonts';
import { SCREEN_WIDTH } from '../engine/screen';
import type { AudioPlayer } from '../engine/audio';
import type { TextureStore } from '../engine/textures';
import { PlaneView, planeSurfaceIds } from './planeView';
import type { Progress } from './progress';
import { FINAL_REPORT_SURFACES, FinalReport, tierFor } from './view/finalReport';
import { FloatingTexts, MAIN_FONT, SCORE_FONT } from './view/floatingText';
import { GasStationView, gasStationSurfaceIds } from './view/gasStationView';
import { GateView, gateSurfaceIds } from './view/gateView';
import { HUD_FONT, HUD_HEIGHT, HUD_SURFACES, Hud } from './view/hud';
import { ORDER_FLAG_SURFACES, OrderFlags } from './view/orderFlags';
import { PlaneState } from './sim/rules';
import { Simulation, type Gate, type Plane, type SimEvent } from './sim/simulation';
import type { StageLayout } from './stages/layout';

// Tints are placeholders: the original colour table is compiled into the binary and not read yet.
const PROVISIONAL_TINTS: Record<string, number> = { BLUE: 0x4aa3ff, PINK: 0xff7fc0, GREEN: 0x6fd36f, CYAN: 0x5fe0e0 };
const NEUTRAL_TINT = 0xd0d0d0;
const tintOf = (color: PlaneColor | null): number => (color ? (PROVISIONAL_TINTS[color] ?? NEUTRAL_TINT) : NEUTRAL_TINT);

const STEP = 1 / 60;

export interface LevelOptions {
  stage: number;
  level: number;
  layout: StageLayout;
  language: Language;
  progress: Progress;
  /** Navigation: a level number, or null for the stage screen. */
  onNavigate: (level: number | null) => void;
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
  private readonly stationViews: GasStationView[] = [];
  private readonly planeViews = new Map<number, PlaneView>();
  private readonly floating = new FloatingTexts();
  private readonly hud: Hud;
  private accumulator = 0;
  private endShown = false;
  private paused = false;

  private constructor(
    private readonly textures: TextureStore,
    private readonly audio: AudioPlayer,
    private readonly strings: Strings,
    private readonly options: LevelOptions,
    sim: Simulation,
    private readonly perStarAmount: number,
    private readonly hasNextLevel: boolean,
  ) {
    this.sim = sim;
    this.hud = new Hud(textures, sim.goals);
    this.hud.onPause = () => (this.paused = !this.paused);
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
    const owned = new Set<number>();
    for (const key of options.progress.improvements) if (Math.floor(key / 1000) === options.stage) owned.add(key % 1000);
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
      level: options.level,
      screenWidth: SCREEN_WIDTH,
    });

    const ids = new Set<string>([...HUD_SURFACES, ...ORDER_FLAG_SURFACES, ...FINAL_REPORT_SURFACES]);
    for (const layer of layout.backdrop.layers) {
      ids.add(layer.resource);
      if (typeof layer.silhouette === 'object') ids.add(layer.silhouette.topRowOf);
    }
    for (const id of [...layout.stopSpotSurfaces.normal, ...layout.stopSpotSurfaces.vip]) ids.add(id);
    for (const decoration of [...layout.decorations, ...layout.gateDecorations]) ids.add(decoration.resource);
    sim.gates.forEach((gate) => {
      for (const id of gateSurfaceIds(gate, gate.letter.charCodeAt(0) - 65)) ids.add(id);
    });
    for (const station of sim.gasStations) for (const id of gasStationSurfaceIds(station)) ids.add(id);
    for (const runway of sim.runways) {
      ids.add(runway.descriptor.backSurface);
      ids.add(`RUNWAY.NUMBER_${runway.number}`);
    }
    for (const spawn of schedule.planes) {
      for (const id of planeSurfaceIds(data.planes.get(spawn.type)!, layout.pontoons)) ids.add(id);
    }
    const [strings] = await Promise.all([
      data.strings(options.language),
      textures.load(ids),
      loadFonts(data.resources, [HUD_FONT, SCORE_FONT, MAIN_FONT]),
    ]);

    const scene = new LevelScene(textures, audio, strings, options, sim, area.perStarAmount, options.level < area.levelsCount);
    app.stage.addChild(scene.root);
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
    if (this.hud.contains(y)) return;
    if (first) {
      this.audio.preload(['SOUNDS.SELECT_PLANE', 'SOUNDS.PLACE_CLICK', 'SOUNDS.FORBIDDEN_CLICK', 'SOUNDS.QUEUE_CANCEL', 'SOUNDS.BONUS_X2']);
      for (const plane of new Set(this.sim.planes.map((p) => p.descriptor))) this.audio.preload(Object.values(plane.sounds).filter((id) => !id.includes('%')));
    }
    this.sim.press(x, y);
  }

  /** A plane's own sound: descriptor slot, with `%s` filled by its sex and its voice pitch. */
  private planeSound(plane: Plane, slot: string): void {
    const pattern = plane.descriptor.sounds[slot];
    if (!pattern) return;
    const voiced = pattern.includes('%s');
    const pitch = voiced ? (plane.sex === 'MALE' ? plane.descriptor.pitch.male : plane.descriptor.pitch.female) : 1;
    this.audio.play(pattern.replace('%s', plane.sex), { pitch });
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
    // Behind everything the original draws a `Sky` object and clouds; the band colours have not been
    // matched exactly, so this is a plain gradient in the same light blues.
    const { horizon, layers } = layout.backdrop;
    const sky = new Graphics();
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const mix = (from: number, to: number): number => Math.round(from + (to - from) * t);
      const color = (mix(0x5c, 0x99) << 16) | (mix(0xb4, 0xe6) << 8) | mix(0xf0, 0xff);
      sky.rect(0, (horizon * i) / bands, SCREEN_WIDTH, horizon / bands + 1).fill(color);
    }
    this.ground.addChild(sky);

    for (const layer of layers) {
      let sprite: Sprite;
      if (layer.silhouette === undefined) {
        sprite = this.textures.sprite(layer.resource);
      } else {
        // An 8-bit grey image used as a silhouette: white is land, black is sky.
        sprite = new Sprite(this.textures.alphaMask(layer.resource));
        sprite.tint = typeof layer.silhouette === 'number' ? layer.silhouette : this.textures.rowColor(layer.silhouette.topRowOf, 0);
      }
      sprite.position.copyFrom(layer.position);
      if (layer.scale) sprite.scale.copyFrom(layer.scale);
      this.ground.addChild(sprite);
    }

    for (const runway of this.sim.runways) {
      const sprite = this.textures.sprite(runway.descriptor.backSurface);
      sprite.position.copyFrom(runway.position);
      // The number is drawn at the end where planes stop; its exact place is not read from the binary.
      const number = this.textures.sprite(`RUNWAY.NUMBER_${runway.number}`);
      number.position.copyFrom(runway.node);
      this.ground.addChild(sprite, number);
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
        (extra.front ? this.overlay : this.ground).addChild(sprite);
      }
      const view = new GateView(this.textures, gate, gate.letter.charCodeAt(0) - 65);
      this.ground.addChild(view);
      this.gateViews.push({ gate, view });
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
    for (const { gate, view } of this.gateViews) view.update(this.paused ? 0 : seconds, tintOf(gate.lastColor));
    for (const view of this.stationViews) view.update();
    const selected = this.sim.selected;
    this.flags.update(selected, selected ? tintOf(selected.color) : 0xffffff);

    for (const plane of this.sim.planes) {
      let view = this.planeViews.get(plane.id);
      if (plane.gone) {
        if (view) {
          view.destroy({ children: true });
          this.planeViews.delete(plane.id);
        }
        continue;
      }
      if (!view) {
        view = new PlaneView(this.textures, plane.descriptor, tintOf(plane.color), this.options.layout.pontoons);
        this.planeLayer.addChild(view);
        this.planeViews.set(plane.id, view);
      }
      view.position.set(plane.x, plane.y);
      view.zIndex = plane.altitude > 0 ? 10000 : plane.y;
      const draining = plane.state === PlaneState.FLYING || plane.state === PlaneState.WAITING;
      // The bubble shows what the plane wants next while it has no orders (0x5f28).
      const idle = draining && !plane.landing && plane.queue.length === 0;
      view.update(seconds, plane.heading, plane.altitude, plane.scale, plane.selected, draining ? plane.energy : null, idle ? plane.need : null);
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
    const { earned } = progress.record(stage, level, this.sim.score, stars, this.perStarAmount);
    const canAdvance = this.hasNextLevel && progress.unlocked(stage, level + 1);
    const report = new FinalReport(this.textures, this.strings, this.sim, level, { earned, canAdvance });
    report.onReplay = () => onNavigate(level);
    report.onNext = () => onNavigate(level + 1);
    report.onMenu = () => onNavigate(null);
    this.root.addChild(report);
  }
}
