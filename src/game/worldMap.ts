import { Container, Rectangle, Text, type Application, type FederatedPointerEvent, type Sprite } from 'pixi.js';
import type { GameData } from '../data/load';
import type { Strings } from '../data/strings';
import type { Point } from '../data/xml';
import type { AudioPlayer } from '../engine/audio';
import { fontFamily, loadFonts } from '../engine/fonts';
import { SCREEN_WIDTH } from '../engine/screen';
import type { TextureStore } from '../engine/textures';
import type { Progress } from './progress';
import { DIALOG_SURFACES } from './view/dialog';
import { MAIN_FONT, SCORE_FONT } from './view/floatingText';
import { LevelDialog, MAP_DIALOG_FONTS, StageDialog } from './view/mapDialogs';
import { findGoals } from '../data/levels';

/** Stage icons and the ribbon under each, in map pixels, from the map script (0xccc8c). */
const STAGE_ICONS: readonly { stage: number; icon: Point; ribbon: Point }[] = [
  { stage: 1, icon: { x: 151, y: 260 }, ribbon: { x: 151, y: 351 } },
  { stage: 2, icon: { x: 280, y: 68 }, ribbon: { x: 280, y: 136 } },
  { stage: 3, icon: { x: 526, y: 255 }, ribbon: { x: 526, y: 323 } },
  { stage: 4, icon: { x: 661, y: 63 }, ribbon: { x: 661, y: 128 } },
  { stage: 5, icon: { x: 901, y: 144 }, ribbon: { x: 901, y: 196 } },
  { stage: 6, icon: { x: 1011, y: 323 }, ribbon: { x: 1011, y: 396 } },
  { stage: 7, icon: { x: 1209, y: 144 }, ribbon: { x: 1209, y: 216 } },
  { stage: 8, icon: { x: 1360, y: 323 }, ribbon: { x: 1360, y: 386 } },
  { stage: 9, icon: { x: 1591, y: 98 }, ribbon: { x: 1591, y: 169 } },
  { stage: 10, icon: { x: 1864, y: 344 }, ribbon: { x: 1864, y: 428 } },
];

/** The map image is 2040×510 and the level table uses its pixels; shown at half size it fills the 480×320 screen above the bar. */
const MAP_SCALE = 0.5;
const MAP_WIDTH = 2040 * MAP_SCALE;
const BAR_Y = 261;

type BarButton = 'RETURN' | 'TUTORIAL' | 'AWARDS' | 'PLAY';
/** Bar buttons (0x5f420–0x5f6f0): hit rectangle, where the pressed image goes and where the label is centred. */
const BUTTONS: readonly { id: BarButton; text: string; x1: number; x2: number; image: number; label: number }[] = [
  { id: 'RETURN', text: 'MAP.MAIN_MENU', x1: 5, x2: 122, image: 5, label: 62 },
  { id: 'TUTORIAL', text: 'MAP.TUTORIAL', x1: 122, x2: 240.5, image: 126, label: 181.5 },
  { id: 'AWARDS', text: 'MAP.AWARDS_ROOM', x1: 240.5, x2: 357, image: 243.5, label: 299 },
  { id: 'PLAY', text: 'MAP.PLAY', x1: 357, x2: 480, image: 361, label: 419 },
];

/**
 * Which marker image a level shows (0x5dc9e): 0 not reached, 1 the next level to play, and
 * 2–6 for a level passed with its goal, expert, master, supreme or perfect score.
 */
export function markerImage(stars: number, isNext: boolean): number {
  if (stars > 0) return stars + 1;
  return isNext ? 1 : 0;
}

export interface WorldMapOptions {
  strings: Strings;
  progress: Progress;
  /** Stages that can be played in this version, with their level counts. */
  playable: Map<number, number>;
  /** Per stage, the improvement that is its plane licence: owning it changes a level's goals. */
  licences: Map<number, number>;
  /** Stage to bring into view at the start; by default the one with the next level to play. */
  focus: number | null;
  onPlay: (stage: number, level: number) => void;
  onMenu: () => void;
}

/**
 * The world map: the original image with the stage icons, ribbons and level markers where the
 * map script and the level position table put them, and the bar with its four buttons. A level
 * is started from the dialog its marker opens, or with Play for the current one; a stage's icon
 * opens its description. Dragging scrolls the map. The
 * original's drifting clouds, ships, wind and satellites are not drawn, and the tutorial and awards buttons do nothing yet.
 */
export class WorldMap {
  readonly root = new Container();
  private readonly map = new Container();
  private readonly cursor: Sprite;
  private dialog: Container | null = null;
  private selected: { stage: number; level: number } | null = null;
  private time = 0;

  private constructor(
    private readonly textures: TextureStore,
    private readonly audio: AudioPlayer,
    private readonly data: GameData,
    positions: Map<number, Point[]>,
    private readonly options: WorldMapOptions,
  ) {
    const { strings, progress, playable } = options;
    this.map.scale.set(MAP_SCALE);
    this.map.addChild(textures.sprite('MAP.BACK'));
    this.cursor = textures.sprite('MAP.LEVEL_SELECTED');
    this.cursor.visible = false;

    for (const { stage, icon, ribbon } of STAGE_ICONS) {
      const picture = textures.sprite(`MAP.STAGES.${stage}`);
      picture.position.copyFrom(icon);
      picture.eventMode = 'static';
      picture.cursor = 'pointer';
      picture.on('pointertap', () => this.askStage(stage));
      const band = textures.sprite('MAP.HERALDIC_RIBBON');
      band.position.copyFrom(ribbon);
      const title = new Text({ text: strings.t(`STAGES.${stage}.TITLE`), style: { fontFamily: fontFamily(MAIN_FONT), fontSize: 20, fill: 0x5a4a2a } });
      title.anchor.set(0.5);
      title.position.set(ribbon.x, ribbon.y - 3);
      this.map.addChild(picture, band, title);
    }
    this.map.addChild(this.cursor);

    let next: { stage: number; level: number } | null = null;
    for (const [stage, levels] of [...positions].sort((a, b) => a[0] - b[0])) {
      levels.forEach((at, index) => {
        const level = index + 1;
        const count = playable.get(stage);
        const reachable = count !== undefined && level <= count && this.stageOpen(stage) && progress.unlocked(stage, level);
        const stars = reachable ? progress.result(stage, level).stars : 0;
        const isNext = reachable && stars === 0;
        if (isNext && !next) next = { stage, level };
        const marker = textures.sprite(`MAP.LEVELS.${markerImage(stars, isNext)}`);
        marker.position.copyFrom(at);
        if (reachable) {
          marker.eventMode = 'static';
          marker.cursor = 'pointer';
          marker.hitArea = new Rectangle(-24, -30, 48, 60);
          marker.on('pointertap', () => {
            audio.play('SOUNDS.CLICK');
            this.askLevel(stage, level);
          });
        }
        this.map.addChild(marker);
      });
    }

    const bar = new Container();
    const back = textures.sprite('MAP.HUD.BACK');
    back.y = BAR_Y;
    const glass = textures.sprite('MAP.HUD.REFLEXION');
    glass.position.set(8, 269);
    bar.addChild(back);
    for (const button of BUTTONS) {
      const enabled = button.id === 'RETURN' || button.id === 'PLAY';
      const pressed = textures.sprite(`MAP.HUD.BUTTONS.${button.id}_ON`);
      pressed.position.set(button.image, 267);
      pressed.visible = false;
      const label = new Text({ text: strings.t(button.text), style: { fontFamily: fontFamily(SCORE_FONT), fontSize: 12, fill: 0xffffff } });
      label.anchor.set(0.5);
      label.position.set(button.label, 305);
      label.alpha = enabled ? 1 : 0.4;
      if (label.width > button.x2 - button.x1 - 8) label.scale.set((button.x2 - button.x1 - 8) / label.width);
      bar.addChild(pressed, label);
      if (!enabled) continue;
      const zone = new Container();
      zone.hitArea = new Rectangle(button.x1, 267, button.x2 - button.x1, 53);
      zone.eventMode = 'static';
      zone.cursor = 'pointer';
      zone.on('pointerover', () => (pressed.visible = true));
      zone.on('pointerout', () => (pressed.visible = false));
      zone.on('pointertap', () => {
        audio.play('SOUNDS.CLICK');
        if (button.id === 'RETURN') options.onMenu();
        else if (this.selected) this.askLevel(this.selected.stage, this.selected.level);
      });
      bar.addChild(zone);
    }
    bar.addChild(glass);

    this.root.addChild(this.map, bar);
    this.enableDragging();

    const start = next as { stage: number; level: number } | null;
    if (start) this.mark(start.stage, start.level, positions.get(start.stage)![start.level - 1]!);
    const centre = STAGE_ICONS.find((s) => s.stage === (options.focus ?? start?.stage ?? 1))?.icon.x ?? 0;
    this.scrollTo(SCREEN_WIDTH / 2 - centre * MAP_SCALE);
  }

  private stageOpen(stage: number): boolean {
    return this.options.progress.stageUnlocked(stage);
  }

  /** The level the profile is on is marked on the map. */
  private mark(stage: number, level: number, at: Point): void {
    this.selected = { stage, level };
    this.cursor.visible = true;
    this.cursor.position.copyFrom(at);
  }

  private open(dialog: Container): void {
    this.dialog = dialog;
    this.root.addChild(dialog);
  }

  private close(): void {
    const closing = this.dialog;
    this.dialog = null;
    // Removed after the touch that closed it has been dispatched.
    if (closing) setTimeout(() => closing.destroy({ children: true }));
  }

  /** Touching a marker, or Play for the current level, asks before starting it (0x64824). */
  private askLevel(stage: number, level: number): void {
    if (this.dialog) return;
    const { strings, progress } = this.options;
    const area = this.data.areas.get(stage)!;
    const licence = this.options.licences.get(stage);
    const goals = findGoals(area, level, licence !== undefined && progress.improvements(stage, level).has(licence));
    this.open(new LevelDialog(this.textures, this.audio, strings, { stage, level, goals, best: progress.result(stage, level).best }, () => this.options.onPlay(stage, level), () => this.close()));
  }

  /** Touching a stage's icon describes it (0x63c60). */
  private askStage(stage: number): void {
    if (this.dialog) return;
    const { strings, progress, playable } = this.options;
    const cleared = playable.has(stage) && progress.record(stage, playable.get(stage)!).tier > 0;
    const prize = cleared ? { stars: progress.stageStars(stage), total: progress.stageReward(stage) } : null;
    this.open(new StageDialog(this.textures, this.audio, strings, { number: stage, prize }, () => this.close()));
  }

  private scrollTo(x: number): void {
    this.map.x = Math.max(SCREEN_WIDTH - MAP_WIDTH, Math.min(0, x));
  }

  private enableDragging(): void {
    let grabbed: { pointer: number; mapX: number } | null = null;
    this.map.eventMode = 'static';
    this.map.hitArea = new Rectangle(0, 0, 2040, 510);
    this.map.on('pointerdown', (event: FederatedPointerEvent) => (grabbed = { pointer: event.global.x, mapX: this.map.x }));
    this.map.on('globalpointermove', (event: FederatedPointerEvent) => {
      if (grabbed) this.scrollTo(grabbed.mapX + event.global.x - grabbed.pointer);
    });
    const release = (): void => void (grabbed = null);
    this.map.on('pointerup', release);
    this.map.on('pointerupoutside', release);
  }

  /** The selection mark breathes so the chosen level stands out. */
  update(seconds: number): void {
    this.time += seconds;
    this.cursor.scale.set(1 + 0.08 * Math.sin(this.time * 5));
  }

  static async create(app: Application, data: GameData, textures: TextureStore, audio: AudioPlayer, options: WorldMapOptions): Promise<WorldMap> {
    const surfaces = [...DIALOG_SURFACES, 'GUI.FINAL_REPORT.STAR_SMALL', 'MAP.BACK', 'MAP.LEVEL_SELECTED', 'MAP.HERALDIC_RIBBON', 'MAP.HUD.BACK', 'MAP.HUD.REFLEXION'];
    for (let i = 0; i <= 6; i++) surfaces.push(`MAP.LEVELS.${i}`);
    for (const { stage } of STAGE_ICONS) surfaces.push(`MAP.STAGES.${stage}`);
    for (const button of BUTTONS) surfaces.push(`MAP.HUD.BUTTONS.${button.id}_ON`);
    const [positions] = await Promise.all([data.levelPositions(), textures.load(surfaces), loadFonts(data.resources, [MAIN_FONT, SCORE_FONT, ...MAP_DIALOG_FONTS])]);
    const map = new WorldMap(textures, audio, data, positions, options);
    app.stage.addChild(map.root);
    app.ticker.add((ticker) => map.update(ticker.deltaMS / 1000));
    audio.preload(['SOUNDS.CLICK']);
    return map;
  }
}
