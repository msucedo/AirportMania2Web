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
import type { AwardPlace } from '../data/awards';
import { levelAwardPictures, levelAwardSurfaces, stageAwardPictures } from './awardsRoom';
import { MAP_DECOR_SURFACES, MAP_GLINTS, MAP_STARS, MAP_STREAKS, MapAirborneIcon, MapBird, MapCarrierWaves, MapCloud, MapGlints, MapSatellite, MapStreak, type Decoration } from './view/mapDecor';
import { AuroraView, StarView } from './view/scenery/night';
import { SnowView } from './view/scenery/northPole';

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
  onAwards: () => void;
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
  /** What moves on the map, each stepped every frame. */
  private readonly decor: { update(dt: number): void }[] = [];

  private constructor(
    private readonly textures: TextureStore,
    private readonly audio: AudioPlayer,
    private readonly data: GameData,
    positions: Map<number, Point[]>,
    private readonly awardPlaces: AwardPlace[],
    private readonly options: WorldMapOptions,
  ) {
    const { strings, progress, playable } = options;
    this.map.scale.set(MAP_SCALE);
    this.map.addChild(textures.sprite('MAP.BACK'));
    this.cursor = textures.sprite('MAP.LEVEL_SELECTED');
    this.cursor.visible = false;

    const icon = (stage: number): Sprite => {
      const picture = textures.sprite(`MAP.STAGES.${stage}`);
      picture.position.copyFrom(STAGE_ICONS[stage - 1]!.icon);
      picture.eventMode = 'static';
      picture.cursor = 'pointer';
      picture.on('pointertap', () => this.askStage(stage));
      // 0x5d54c: while touched an icon swells by up to 8 %, its press easing at 5 a second (0xa068).
      let held = false;
      let press = 0;
      picture.on('pointerdown', () => (held = true));
      picture.on('pointerup', () => (held = false));
      picture.on('pointerupoutside', () => (held = false));
      picture.on('pointerout', () => (held = false));
      this.decor.push({
        update: (dt) => {
          press = Math.max(0, Math.min(1, press + (held ? 5 : -5) * dt));
          picture.scale.set(1 + 0.08 * press);
        },
      });
      this.map.addChild(picture);
      return picture;
    };
    const ribbon = (stage: number): void => {
      const at = STAGE_ICONS[stage - 1]!.ribbon;
      const band = textures.sprite('MAP.HERALDIC_RIBBON');
      band.position.copyFrom(at);
      const title = new Text({ text: strings.t(`STAGES.${stage}.TITLE`), style: { fontFamily: fontFamily(MAIN_FONT), fontSize: 20, fill: 0x5a4a2a } });
      title.anchor.set(0.5);
      title.position.set(at.x, at.y - 3);
      this.map.addChild(band, title);
    };
    const put = (item: Decoration | (Container & { update(dt: number): void })): void => {
      const view = 'view' in item ? item.view : item;
      view.eventMode = 'none';
      this.map.addChild(view);
      this.decor.push(item);
    };
    // In the order the script makes them, which is the order they are drawn in. The "coming soon"
    // sign is only made when the game ends before stage 10 (0xcd6c6), which this one does not.
    for (const patch of MAP_GLINTS) put(new MapGlints(textures, patch));
    icon(1);
    ribbon(1);
    icon(2);
    const front = textures.sprite('MAP.ISLAND_FRONT');
    front.position.set(214, 75);
    front.eventMode = 'none';
    this.map.addChild(front);
    ribbon(2);
    icon(3);
    ribbon(3);
    for (const at of [{ x: 526, y: 255 }, { x: 510, y: 255 }, { x: 526, y: 272 }]) put(new MapBird(textures, at));
    icon(4);
    ribbon(4);
    for (const resource of ['SNOW_FLAKES.3', 'SNOW_FLAKES.4']) put(new SnowView(textures, { resource, left: 542, top: 0, right: 746, bottom: 143, drift: 10, fall: 25, interval: 0.05 }));
    put(new MapCloud(textures, 'MAP.CLOUDS.SMALL', { x: 994, y: 34 }, 0.1, 1));
    put(new MapCloud(textures, 'MAP.CLOUDS.MEDIUM', { x: 1015, y: 73 }, 0.2, 2));
    put(new MapCloud(textures, 'MAP.CLOUDS.BIG', { x: 938, y: 72 }, 0.3, 3.5));
    // 0x60408: stage 5's icon hangs in the air on four propellers.
    this.decor.push(new MapAirborneIcon(textures, icon(5)));
    ribbon(5);
    for (const wind of MAP_STREAKS.slice(0, 4)) put(new MapStreak(textures, wind));
    icon(6);
    ribbon(6);
    put(new AuroraView(textures, 'STAGES.ANTARCTIC.AURORA_BOREALIS', { x: 1146, y: -63, scaleX: 0.4, scaleY: 0.85, angle: 25 }));
    icon(7);
    ribbon(7);
    put(new MapCarrierWaves(textures, { x: 1368, y: 331 }));
    for (const stage of [8, 9, 10]) {
      icon(stage);
      ribbon(stage);
    }
    for (const star of MAP_STREAKS.slice(4)) put(new MapStreak(textures, star));
    for (const [x, y, size] of MAP_STARS) put(new StarView(textures, { x, y }, size));
    put(new MapSatellite(textures, { x: 1813, y: 80 }));
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
        // The tutorial is stage 0; its first day starts at once.
        else if (button.id === 'TUTORIAL') options.onPlay(0, 1);
        else if (button.id === 'AWARDS') options.onAwards();
        else if (button.id === 'PLAY' && this.selected) this.askLevel(this.selected.stage, this.selected.level);
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
    this.open(new LevelDialog(this.textures, this.audio, strings, { stage, level, goals, best: progress.result(stage, level).best, awards: this.levelAwards(stage, level) }, () => this.options.onPlay(stage, level), () => this.close()));
  }

  private levelAwards(stage: number, level: number): Container[] {
    return levelAwardPictures(this.textures, this.awardPlaces, this.options.progress.awards, stage, level);
  }

  /** Touching a stage's icon describes it (0x63c60). */
  private askStage(stage: number): void {
    if (this.dialog) return;
    const { strings, progress, playable } = this.options;
    const cleared = playable.has(stage) && progress.record(stage, playable.get(stage)!).tier > 0;
    const prize = cleared ? { stars: progress.stageStars(stage), ...progress.stageRates(stage) } : null;
    this.open(new StageDialog(this.textures, this.audio, strings, { number: stage, prize, awards: stageAwardPictures(this.textures, this.awardPlaces, progress.awards, stage) }, () => this.close()));
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
    for (const item of this.decor) item.update(seconds);
  }

  static async create(app: Application, data: GameData, textures: TextureStore, audio: AudioPlayer, options: WorldMapOptions): Promise<WorldMap> {
    const surfaces = [...DIALOG_SURFACES, 'GUI.INGAMEGUI.SCORE_GOAL_BACK', 'GUI.FINAL_REPORT.STAR_SMALL', 'MAP.BACK', 'MAP.LEVEL_SELECTED', 'MAP.HERALDIC_RIBBON', 'MAP.HUD.BACK', 'MAP.HUD.REFLEXION', ...MAP_DECOR_SURFACES];
    for (let i = 0; i <= 6; i++) surfaces.push(`MAP.LEVELS.${i}`);
    for (const { stage } of STAGE_ICONS) surfaces.push(`MAP.STAGES.${stage}`);
    for (const button of BUTTONS) surfaces.push(`MAP.HUD.BUTTONS.${button.id}_ON`);
    const awardPlaces = await data.awards();
    surfaces.push(...levelAwardSurfaces(awardPlaces, true));
    const [positions] = await Promise.all([data.levelPositions(), textures.load(surfaces), loadFonts(data.resources, [MAIN_FONT, SCORE_FONT, ...MAP_DIALOG_FONTS])]);
    const map = new WorldMap(textures, audio, data, positions, awardPlaces, options);
    app.stage.addChild(map.root);
    app.ticker.add((ticker) => map.update(ticker.deltaMS / 1000));
    audio.preload(['SOUNDS.CLICK']);
    return map;
  }
}
