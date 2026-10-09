import { Container, Graphics, Sprite, Text, type Application, type FederatedPointerEvent } from 'pixi.js';
import type { GameData } from '../data/load';
import { findGoals, findLevel, type PlaneColor } from '../data/levels';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../engine/screen';
import type { AudioPlayer } from '../engine/audio';
import type { TextureStore } from '../engine/textures';
import { PlaneView, planeSurfaceIds } from './planeView';
import { PlaneState } from './sim/rules';
import { Simulation, type Gate, type Plane, type SimEvent } from './sim/simulation';
import type { StageLayout } from './stages/arches';

// Tints are placeholders: the original colour table is compiled into the binary and not read yet.
const PROVISIONAL_TINTS: Record<string, number> = { BLUE: 0x4aa3ff, PINK: 0xff7fc0, GREEN: 0x6fd36f, CYAN: 0x5fe0e0 };
const NEUTRAL_TINT = 0xd0d0d0;
const tintOf = (color: PlaneColor | null): number => (color ? (PROVISIONAL_TINTS[color] ?? NEUTRAL_TINT) : NEUTRAL_TINT);

const STEP = 1 / 60;
const HUD_HEIGHT = 34;

interface GateView {
  gate: Gate;
  color: Sprite;
  bar: Graphics;
}

interface FloatingText {
  text: Text;
  age: number;
}

export interface LevelOptions {
  stage: number;
  level: number;
  layout: StageLayout;
  showNodes?: boolean;
}

export class LevelScene {
  readonly root = new Container();
  readonly sim: Simulation;

  private readonly ground = new Container();
  private readonly planeLayer = new Container();
  private readonly overlay = new Container();
  private readonly gateViews: GateView[] = [];
  private readonly planeViews = new Map<number, { view: PlaneView; marks: Graphics }>();
  private readonly floating: FloatingText[] = [];
  private readonly hud: Text;
  private accumulator = 0;
  private endShown = false;

  private constructor(
    private readonly textures: TextureStore,
    private readonly audio: AudioPlayer,
    private readonly options: LevelOptions,
    sim: Simulation,
  ) {
    this.sim = sim;
    this.hud = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 11, fill: 0xffffff } });
    this.hud.position.set(6, 4);
    this.root.addChild(this.ground, this.planeLayer, this.overlay);
    this.build();
  }

  static async create(app: Application, data: GameData, textures: TextureStore, audio: AudioPlayer, options: LevelOptions): Promise<LevelScene> {
    const { layout } = options;
    const stage = await data.stage(options.stage);
    const area = data.areas.get(options.stage);
    if (!area) throw new Error(`Unknown stage ${options.stage}`);
    const schedule = findLevel(stage, options.level, false);
    const sim = new Simulation({
      layout,
      schedule,
      goals: findGoals(area, options.level, false),
      planes: data.planes,
      gates: data.gates,
      runways: data.runways,
      screenWidth: SCREEN_WIDTH,
    });

    const ids = new Set<string>([layout.backgroundDown.resource, layout.backgroundTop.resource, 'STOPSPOT']);
    for (const decoration of layout.decorations) ids.add(decoration.resource);
    for (const gate of sim.gates) {
      ids.add(gate.descriptor.surfaces.color);
      ids.add(gate.descriptor.surfaces.front);
    }
    for (const runway of sim.runways) ids.add(runway.descriptor.backSurface);
    for (const spawn of schedule.planes) {
      for (const id of planeSurfaceIds(data.planes.get(spawn.type)!, 0)) ids.add(id);
    }
    await textures.load(ids);

    const scene = new LevelScene(textures, audio, options, sim);
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
    this.accumulator += Math.min(seconds, 0.25);
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
    const down = this.textures.sprite(layout.backgroundDown.resource);
    down.position.copyFrom(layout.backgroundDown.position);
    down.scale.copyFrom(layout.backgroundDown.scale);

    // The upper background is a greyscale mask in the original. Until its compositing is known,
    // the ground tile is extended up to the HUD and the mask is left out.
    const upper = this.textures.sprite(layout.backgroundDown.resource);
    upper.position.set(0, HUD_HEIGHT);
    upper.scale.set(layout.backgroundDown.scale.x, (layout.backgroundDown.position.y - HUD_HEIGHT) / upper.texture.height);
    this.ground.addChild(upper, down);

    for (const runway of this.sim.runways) {
      const sprite = this.textures.sprite(runway.descriptor.backSurface);
      sprite.position.copyFrom(runway.position);
      this.ground.addChild(sprite);
    }
    for (const spot of layout.stopSpots.filter((s) => s.requires === null)) {
      const sprite = this.textures.sprite('STOPSPOT');
      sprite.position.copyFrom(spot.position);
      this.ground.addChild(sprite);
    }
    for (const gate of this.sim.gates) {
      const view = new Container();
      view.position.copyFrom(gate.position);
      const color = this.textures.sprite(gate.descriptor.surfaces.color);
      const bar = new Graphics();
      view.addChild(color, this.textures.sprite(gate.descriptor.surfaces.front), bar);
      this.ground.addChild(view);
      this.gateViews.push({ gate, color, bar });
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

    const hudBack = new Graphics().rect(0, 0, SCREEN_WIDTH, HUD_HEIGHT).fill(0x1b2a3a);
    this.overlay.addChild(hudBack, this.hud);
  }

  private onEvent(event: SimEvent): void {
    this.playEvent(event);
    switch (event.type) {
      case 'score':
        if (event.points > 0) {
          const label = event.multiplier > 1 ? `+${event.points}  x${event.multiplier}` : `+${event.points}`;
          this.float(label, event.plane, 0xffe066, -30);
        } else if (event.points < 0) {
          this.float(String(event.points), event.plane, 0xff6b6b, -30);
        }
        break;
      case 'punctuality':
        this.float(event.result.replace('_', ' '), event.plane, event.result === 'LATE' ? 0xff6b6b : 0x9be37a, -50);
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

  private float(label: string, plane: Plane, fill: number, offsetY: number): void {
    const text = new Text({ text: label, style: { fontFamily: 'sans-serif', fontSize: 12, fontWeight: 'bold', fill, stroke: { color: 0x000000, width: 3 } } });
    text.anchor.set(0.5);
    text.position.set(plane.x, plane.y - plane.altitude + offsetY);
    this.overlay.addChild(text);
    this.floating.push({ text, age: 0 });
  }

  private draw(seconds: number): void {
    for (const { gate, color, bar } of this.gateViews) {
      color.tint = tintOf(gate.lastColor);
      bar.clear();
      const plane = gate.plane;
      if (plane && (gate.service === 'unloading' || gate.service === 'loading')) {
        const fraction = Math.min(1, gate.progress / plane.descriptor.times.loading);
        bar.rect(-20, -44, 40, 5).fill(0x000000);
        bar.rect(-19, -43, 38 * fraction, 3).fill(gate.service === 'unloading' ? 0xffb347 : 0x7ad37a);
      }
    }

    for (const plane of this.sim.planes) {
      let entry = this.planeViews.get(plane.id);
      if (plane.gone) {
        if (entry) {
          entry.view.destroy({ children: true });
          entry.marks.destroy();
          this.planeViews.delete(plane.id);
        }
        continue;
      }
      if (!entry) {
        entry = { view: new PlaneView(this.textures, plane.descriptor, 0, tintOf(plane.color)), marks: new Graphics() };
        this.planeLayer.addChild(entry.marks, entry.view);
        this.planeViews.set(plane.id, entry);
      }
      const { view, marks } = entry;
      const drawY = plane.y - plane.altitude;
      view.position.set(plane.x, drawY);
      // The artwork faces left.
      view.scale.set(plane.facing > 0 ? -plane.scale : plane.scale, plane.scale);
      view.zIndex = plane.altitude > 0 ? 10000 : plane.y;

      marks.clear();
      if (plane.selected) marks.ellipse(plane.x, drawY + 14, 30, 11).stroke({ color: 0xffffff, width: 2 });
      const draining = plane.state === PlaneState.FLYING || plane.state === PlaneState.WAITING;
      if (draining) {
        const fraction = Math.max(0, Math.min(1, plane.energy));
        const fill = fraction >= 0.6 ? 0x7ad37a : fraction >= 0.3 ? 0xffd24a : 0xff6b6b;
        marks.rect(plane.x - 16, drawY - 36, 32, 5).fill(0x000000);
        marks.rect(plane.x - 15, drawY - 35, 30 * fraction, 3).fill(fill);
      }
    }
    this.planeLayer.sortableChildren = true;

    for (let i = this.floating.length - 1; i >= 0; i--) {
      const item = this.floating[i]!;
      item.age += seconds;
      item.text.y -= 18 * seconds;
      item.text.alpha = Math.max(0, 1 - item.age / 1.4);
      if (item.age >= 1.4) {
        item.text.destroy();
        this.floating.splice(i, 1);
      }
    }

    const goals = this.sim.goals;
    const remaining = Math.max(0, Math.ceil(this.sim.totalTime - this.sim.time));
    this.hud.text = `Score ${this.sim.score}   Goal ${goals.goal}   Expert ${goals.expert}\nTime ${remaining}s`;

    if (this.sim.ended && !this.endShown) this.showEnd();
  }

  private showEnd(): void {
    this.endShown = true;
    const { score, goals } = this.sim;
    const tiers: [string, number][] = [
      ['PERFECT', goals.perfect],
      ['SUPREME', goals.supreme],
      ['MASTER', goals.master],
      ['EXPERT', goals.expert],
      ['GOAL', goals.goal],
    ];
    const reached = tiers.find(([, value]) => score >= value)?.[0] ?? 'FAILED';
    const report = reached === 'FAILED' ? 'FAIL' : reached;
    this.audio.playMusic(`MUSICS.FINAL_REPORT.${report}`);
    this.audio.play(`SOUNDS.FINAL_REPORT.${report}`);
    const panel = new Graphics().roundRect(110, 100, 260, 120, 10).fill({ color: 0x000000, alpha: 0.8 });
    const text = new Text({
      text: `Level complete\nScore ${score}\n${reached}`,
      style: { fontFamily: 'sans-serif', fontSize: 18, fill: 0xffffff, align: 'center', lineHeight: 28 },
    });
    text.anchor.set(0.5);
    text.position.set(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    this.overlay.addChild(panel, text);
  }
}
