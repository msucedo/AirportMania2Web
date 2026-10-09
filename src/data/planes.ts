import { bool, child, children, num, optNum, point, requireChild, root, str, type Point, type XmlNode } from './xml';

/** The three drawing perspectives every plane part is authored for. */
export type Perspective = 0 | 1 | 2;
export const PERSPECTIVES: readonly Perspective[] = [0, 1, 2];

export interface PartPlacement extends Point {
  visible: boolean;
}

export interface AttachedPart extends Point {
  resource: string;
  remarkResource: string;
}

export interface PairPlacement {
  left: Point;
  right: Point;
  flip: boolean;
}

export interface Propeller extends Point {
  number: number;
  type: number;
  back: boolean;
}

export interface PlaneDescriptor {
  type: number;
  nameId: string;
  descriptionId: string;
  passengers: number;
  /** Symbolic constants (PATIENCE_VALUES.* / SPEED_VALUES.*) resolved by the game rules. */
  patience: string;
  loadingSpeed: string;
  points: {
    runway: number;
    gate: number;
    hangar: number;
    gasStation: number;
    leaving: number;
    washing: number;
    luggage: number;
  };
  /** Durations in seconds. */
  times: {
    loading: number;
    luggageLoading: number;
    fueling: number;
    servicing: number;
    maleEnergyFall: number;
    femaleEnergyFall: number;
  };
  /** Resource prefixes; append ".<perspective>" to get a surface id. */
  body: { front: string; color: string; dirt: string; remark: string; offsetY: number; energyBarOffsetY: number };
  shadow: string;
  eyes: { opened: string; closed: string; movement: number; placement: PartPlacement[] };
  mouth: PartPlacement[];
  pantoons: AttachedPart[];
  rail: { alwaysDown: boolean; parts: AttachedPart[] } | null;
  eyebrows: PairPlacement[];
  eyelashes: PairPlacement[];
  propellers: Propeller[][];
  bubble: Point;
  sounds: Record<string, string>;
  pitch: { male: number; female: number };
}

function byPerspective<T>(node: XmlNode | undefined, map: (n: XmlNode) => T): T[] {
  if (!node) return [];
  const out: T[] = [];
  for (const p of children(node, 'Perspective')) out[num(p, 'Id')] = map(p);
  return out;
}

const placement = (n: XmlNode): PartPlacement => ({ ...point(n), visible: bool(n, 'Visible', true) });
const attached = (n: XmlNode): AttachedPart => ({
  ...point(n),
  resource: str(n, 'Resource'),
  remarkResource: str(n, 'ResourceRemark'),
});
const pair = (n: XmlNode): PairPlacement => ({
  left: { x: num(n, 'lx'), y: num(n, 'ly') },
  right: { x: num(n, 'rx'), y: num(n, 'ry') },
  flip: bool(n, 'Flip'),
});

function parsePlane(node: XmlNode): PlaneDescriptor {
  const body = requireChild(node, 'Body');
  const eyes = requireChild(node, 'Eyes');
  const rail = child(node, 'Rail');
  const sounds = requireChild(node, 'Sounds');

  // Several propellers can share a perspective, so group them instead of indexing.
  const propellers: Propeller[][] = [[], [], []];
  for (const p of children(child(node, 'Propellers') ?? { t: '', a: {}, c: [] }, 'Perspective')) {
    propellers[num(p, 'Id')]?.push({ ...point(p), number: num(p, 'Number'), type: num(p, 'Type'), back: bool(p, 'Back') });
  }

  const { MalePitch, FemalePitch, ...soundIds } = sounds.a;

  return {
    type: num(node, 'Type'),
    nameId: str(node, 'Name'),
    descriptionId: str(node, 'Description'),
    passengers: num(node, 'Passengers'),
    patience: str(node, 'Patience'),
    loadingSpeed: str(node, 'LoadingSpeed'),
    points: {
      runway: num(node, 'RunwayPoints'),
      gate: num(node, 'GatePoints'),
      hangar: num(node, 'HangarPoints'),
      gasStation: num(node, 'GasStationPoints'),
      leaving: num(node, 'LeavingPoints'),
      washing: num(node, 'WashingPoints'),
      luggage: num(node, 'LuggagePoints'),
    },
    times: {
      loading: num(node, 'LoadingTime'),
      luggageLoading: num(node, 'LuggageLoadingTime'),
      fueling: num(node, 'FuelingTime'),
      servicing: num(node, 'ServicingTime'),
      maleEnergyFall: num(node, 'MaleEnergyFallTime'),
      femaleEnergyFall: num(node, 'FemaleEnergyFallTime'),
    },
    body: {
      front: str(body, 'FrontResource'),
      color: str(body, 'ColorResource'),
      dirt: str(body, 'DirtResource'),
      remark: str(requireChild(node, 'Remark'), 'Resource'),
      offsetY: optNum(body, 'DespY', 0),
      energyBarOffsetY: optNum(body, 'EnergyVarYDesp', 0),
    },
    shadow: str(requireChild(node, 'Shadow'), 'Resource'),
    eyes: {
      opened: str(requireChild(node, 'OpenedEyes'), 'Resource'),
      closed: str(requireChild(node, 'ClosedEyes'), 'Resource'),
      movement: optNum(eyes, 'Movement', 0),
      placement: byPerspective(eyes, placement),
    },
    mouth: byPerspective(child(node, 'Mouth'), placement),
    pantoons: byPerspective(child(node, 'Pantoons'), attached),
    rail: rail ? { alwaysDown: bool(rail, 'AlwaysDown'), parts: byPerspective(rail, attached) } : null,
    eyebrows: byPerspective(child(node, 'Eyebrows'), pair),
    eyelashes: byPerspective(child(node, 'Eyelashes'), pair),
    propellers,
    bubble: point(requireChild(node, 'BubblePosition')),
    sounds: soundIds,
    pitch: { male: Number.parseFloat(MalePitch ?? '1'), female: Number.parseFloat(FemalePitch ?? '1') },
  };
}

export function parsePlaneTable(tree: XmlNode[]): Map<number, PlaneDescriptor> {
  const table = new Map<number, PlaneDescriptor>();
  for (const node of children(root(tree, 'PlaneDescriptorTable'), 'Plane')) {
    const plane = parsePlane(node);
    table.set(plane.type, plane);
  }
  return table;
}
