import { bool, child, children, num, point, requireChild, root, str, type Point, type XmlNode } from './xml';

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GateDescriptor {
  type: number;
  /** Multiplier applied to loading/unloading speed. */
  speed: number;
  /** Heading, in degrees, of a plane parked at the gate. */
  planeOrientation: number;
  depthOffset: number;
  scaleNumber: boolean;
  labelOver: boolean;
  surfaces: { remark: string; front: string; color: string; letterPattern: string };
  arrows: { loading: string; unloading: string }[];
  /** All positions are relative to the gate's own position. */
  node: Point;
  arrowsPosition: Point;
  iconBar: Point;
  bonus: Point;
  click: Rect;
  friendNodes: Point[];
}

export interface RunwayDescriptor {
  type: number;
  /** Seconds a combo stays alive on this runway. */
  comboTime: number;
  backSurface: string;
}

export interface GasStationDescriptor {
  type: number;
  /** Multiplier applied to fueling speed. */
  speed: number;
  surfaces: { back: string; remark: string; spot: string };
  node: Point;
  click: Rect;
}

export interface HangarDescriptor {
  type: number;
  /** Multiplier applied to servicing speed. */
  speed: number;
  surfaces: { back: string; front: string; remark: string };
  node: Point;
  click: Rect;
}

function rect(n: XmlNode): Rect {
  return { x1: num(n, 'x1'), y1: num(n, 'y1'), x2: num(n, 'x2'), y2: num(n, 'y2') };
}

export function parseGateTable(tree: XmlNode[]): Map<number, GateDescriptor> {
  const table = new Map<number, GateDescriptor>();
  for (const node of children(root(tree, 'GateDescriptorTable'), 'Gate')) {
    const surfaces = requireChild(node, 'SurfaceResources');
    const friends = child(node, 'FriendNodes');
    const friendNodes: Point[] = [];
    for (const n of friends ? children(friends, 'Node') : []) friendNodes[num(n, 'Id')] = point(n);
    const gate: GateDescriptor = {
      type: num(node, 'Type'),
      speed: num(node, 'Speed'),
      planeOrientation: num(node, 'PlaneOrientation'),
      depthOffset: num(node, 'DespZ'),
      scaleNumber: bool(node, 'ScaleNumber'),
      labelOver: bool(node, 'LabelOver'),
      surfaces: {
        remark: str(surfaces, 'RemarkSurfaceResource'),
        front: str(surfaces, 'FrontSurfaceResource'),
        color: str(surfaces, 'ColorSurfaceResource'),
        letterPattern: str(surfaces, 'LetterSurfaceResource'),
      },
      arrows: children(node, 'ArrowsResources').map((n) => ({ loading: str(n, 'Loading'), unloading: str(n, 'Unloading') })),
      node: point(requireChild(node, 'NodePosition')),
      arrowsPosition: point(requireChild(node, 'ArrowsPosition')),
      iconBar: point(requireChild(node, 'IconBarPosition')),
      bonus: point(requireChild(node, 'BonusPosition')),
      click: rect(requireChild(node, 'ClickRectangle')),
      friendNodes,
    };
    table.set(gate.type, gate);
  }
  return table;
}

export function parseGasStationTable(tree: XmlNode[]): Map<number, GasStationDescriptor> {
  const table = new Map<number, GasStationDescriptor>();
  for (const node of children(root(tree, 'GasStationDescriptorTable'), 'GasStation')) {
    const station: GasStationDescriptor = {
      type: num(node, 'Type'),
      speed: num(node, 'Speed'),
      surfaces: { back: str(node, 'BackSurfaceResource'), remark: str(node, 'RemarkSurfaceResource'), spot: str(node, 'SurfaceSpotResource') },
      node: point(requireChild(node, 'NodePosition')),
      click: rect(requireChild(node, 'Rectangle')),
    };
    table.set(station.type, station);
  }
  return table;
}

export function parseHangarTable(tree: XmlNode[]): Map<number, HangarDescriptor> {
  const table = new Map<number, HangarDescriptor>();
  for (const node of children(root(tree, 'HangarDescriptorTable'), 'Hangar')) {
    const hangar: HangarDescriptor = {
      type: num(node, 'Type'),
      speed: num(node, 'Speed'),
      surfaces: { back: str(node, 'BackSurfaceResource'), front: str(node, 'FrontSurfaceResource'), remark: str(node, 'RemarkSurfaceResource') },
      node: point(requireChild(node, 'NodePosition')),
      click: rect(requireChild(node, 'ClickRectangle')),
    };
    table.set(hangar.type, hangar);
  }
  return table;
}

export function parseRunwayTable(tree: XmlNode[]): Map<number, RunwayDescriptor> {
  const table = new Map<number, RunwayDescriptor>();
  for (const node of children(root(tree, 'RunwayDescriptorTable'), 'Runway')) {
    const runway: RunwayDescriptor = {
      type: num(node, 'Type'),
      comboTime: num(node, 'ComboTimeTotal'),
      backSurface: str(node, 'BackSurfaceResource'),
    };
    table.set(runway.type, runway);
  }
  return table;
}
