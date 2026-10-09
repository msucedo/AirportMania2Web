import { bool, children, num, root, str, type XmlNode } from './xml';

export type PlaneColor = 'BLUE' | 'PINK' | 'GREEN' | 'CYAN' | (string & {});
export type Side = 'LEFT' | 'RIGHT';
export type Sex = 'MALE' | 'FEMALE';

/** One scheduled arrival in a level. */
export interface PlaneSpawn {
  type: number;
  /** Seconds from level start. */
  time: number;
  color: PlaneColor;
  side: Side;
  sex: Sex;
  needService: boolean;
  needGas: boolean;
  needLuggage: boolean;
  needWash: boolean;
  passengers: string;
}

export interface LevelSchedule {
  id: number;
  /** Level length in seconds. */
  totalTime: number;
  /** Variant used once the stage's extra plane has been unlocked. */
  hasExtraPlane: boolean;
  planes: PlaneSpawn[];
}

export interface StageSchedule {
  stage: number;
  extraPlaneType: number;
  levels: LevelSchedule[];
}

export function parseStageSchedule(tree: XmlNode[]): StageSchedule {
  const map = root(tree, 'MapLevels');
  return {
    stage: num(map, 'Id'),
    extraPlaneType: num(map, 'ExtraPlane'),
    levels: children(map, 'Level').map((level) => ({
      id: num(level, 'Id'),
      totalTime: num(level, 'TotalTime'),
      hasExtraPlane: bool(level, 'HasExtraPlane'),
      planes: children(level, 'Plane').map((p) => ({
        type: num(p, 'Type'),
        time: num(p, 'Time'),
        color: str(p, 'Color'),
        side: str(p, 'Side') as Side,
        sex: str(p, 'Sex') as Sex,
        needService: bool(p, 'NeedService'),
        needGas: bool(p, 'NeedGas'),
        needLuggage: bool(p, 'NeedLuggage'),
        needWash: bool(p, 'NeedWash'),
        passengers: str(p, 'Passengers'),
      })),
    })),
  };
}

export function findLevel(stage: StageSchedule, id: number, hasExtraPlane: boolean): LevelSchedule {
  const level = stage.levels.find((l) => l.id === id && l.hasExtraPlane === hasExtraPlane);
  if (!level) throw new Error(`Stage ${stage.stage} has no level ${id} (extra plane: ${hasExtraPlane})`);
  return level;
}

/** Score thresholds for one level, lowest to highest. */
export interface LevelGoals {
  number: number;
  extraPlane: boolean;
  goal: number;
  expert: number;
  master: number;
  supreme: number;
  perfect: number;
  fogs: number;
  ices: number;
  sands: number;
}

export interface AreaInfo {
  number: number;
  levelsCount: number;
  extraPlaneType: number;
  titleId: string;
  nameId: string;
  music: string;
  perStarAmount: number;
  stageClearAmount: number;
  planesUsePantoons: boolean;
  levels: LevelGoals[];
}

export function parseLevelsDb(tree: XmlNode[]): Map<number, AreaInfo> {
  const areas = new Map<number, AreaInfo>();
  for (const area of children(root(tree, 'LevelsDB'), 'Area')) {
    const info: AreaInfo = {
      number: num(area, 'Number'),
      levelsCount: num(area, 'LevelsCount'),
      extraPlaneType: num(area, 'ExtraPlaneNumber'),
      titleId: str(area, 'Title'),
      nameId: str(area, 'Name'),
      music: str(area, 'Music'),
      perStarAmount: num(area, 'PerStarAmount'),
      stageClearAmount: num(area, 'StageClearAmount'),
      planesUsePantoons: bool(area, 'PlanesUsePantoons'),
      levels: children(area, 'Level').map((l) => ({
        number: num(l, 'Number'),
        extraPlane: bool(l, 'ExtraPlane'),
        goal: num(l, 'Goal'),
        expert: num(l, 'Expert'),
        master: num(l, 'Master'),
        supreme: num(l, 'Supreme'),
        perfect: num(l, 'Perfect'),
        fogs: num(l, 'Fogs'),
        ices: num(l, 'Ices'),
        sands: num(l, 'Sands'),
      })),
    };
    areas.set(info.number, info);
  }
  return areas;
}

export function findGoals(area: AreaInfo, number: number, extraPlane: boolean): LevelGoals {
  const goals = area.levels.find((l) => l.number === number && l.extraPlane === extraPlane);
  if (!goals) throw new Error(`Area ${area.number} has no goals for level ${number} (extra plane: ${extraPlane})`);
  return goals;
}
