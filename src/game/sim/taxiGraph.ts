import type { Point } from '../../data/xml';

// The original taxi graph (0x45d58 link rule, 0x45bd4 auto-link pass, 0x46230 router).

export interface TaxiNode extends Point {
  id: number;
  /** Terminal nodes belong to a place: routes may end on them but never pass through. */
  terminal: boolean;
  /** Held by a plane standing on it or on its way to it (`node+0xc`); routes go round it. */
  occupied: boolean;
  links: TaxiNode[];
}

/** A third node this close to a segment's interior blocks the link. */
const BLOCK_DISTANCE = 8;
const BLOCK_FROM = 0.02;
const BLOCK_TO = 0.98;
const CROSS_TOLERANCE = 0.1;

/** Offsets of the pass-through nodes a runway places around each of its ends (0x13d974…). */
const RING_X = [86, 131, 176, 189, 202, 157, 112];
const RING_Y = [-14, -14, -14, 0, 14, 14, 14];
/** Two extra free-standing nodes near the runway centre. */
const RUNWAY_EXTRA: Point[] = [
  { x: -13, y: -14 },
  { x: 13, y: 14 },
];

export class TaxiGraph {
  readonly nodes: TaxiNode[] = [];

  addNode(position: Point, terminal: boolean): TaxiNode {
    const node: TaxiNode = { id: this.nodes.length, x: position.x, y: position.y, terminal, occupied: false, links: [] };
    this.nodes.push(node);
    return node;
  }

  /** `0x45d58`: links two nodes unless another node sits on the segment or it would cross a link. */
  link(a: TaxiNode, b: TaxiNode): boolean {
    if (a === b || a.links.includes(b)) return false;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return false;

    for (const node of this.nodes) {
      if (node === a || node === b) continue;
      const vx = node.x - a.x;
      const vy = node.y - a.y;
      const across = Math.abs(vx * dy - vy * dx) / length;
      if (across >= BLOCK_DISTANCE) continue;
      const along = (vx * dx + vy * dy) / (length * length);
      if (along > BLOCK_FROM && along < BLOCK_TO) return false;
    }

    for (const from of this.nodes) {
      for (const to of from.links) {
        if (from.id > to.id) continue;
        if (from === a || from === b || to === a || to === b) continue;
        if (crosses(a, b, from, to)) return false;
      }
    }

    a.links.push(b);
    b.links.push(a);
    return true;
  }

  /** `0x45bd4`: tries every pair of pass-through nodes, nearest first, with vertical distance doubled. */
  autoLink(): void {
    const pairs: { a: TaxiNode; b: TaxiNode; distance: number }[] = [];
    const open = this.nodes.filter((n) => !n.terminal);
    for (let i = 0; i < open.length; i++) {
      for (let j = i + 1; j < open.length; j++) {
        const a = open[i]!;
        const b = open[j]!;
        pairs.push({ a, b, distance: Math.hypot(a.x - b.x, 2 * (a.y - b.y)) });
      }
    }
    pairs.sort((p, q) => p.distance - q.distance);
    for (const { a, b } of pairs) this.link(a, b);
  }

  /** A gate's three friend nodes, linked to the gate node and chained (gate constructor, 0x430e6). */
  addGate(node: Point, friends: Point[]): TaxiNode {
    const gate = this.addNode(node, true);
    const created = friends.map((p) => this.addNode(p, false));
    for (const friend of created) this.link(gate, friend);
    for (let i = 0; i + 1 < created.length; i++) this.link(created[i]!, created[i + 1]!);
    return gate;
  }

  /** A gas station's node and its two pass-through nodes (constructor 0x40952). */
  addGasStation(node: Point): TaxiNode {
    const station = this.addNode(node, true);
    const right = this.addNode({ x: node.x + 30, y: node.y + 9 }, false);
    const left = this.addNode({ x: node.x - 15, y: node.y + 9 }, false);
    this.link(station, right);
    this.link(station, left);
    this.link(right, left);
    return station;
  }

  /**
   * A luggage conveyor's node and the nodes its constructor adds (0x567f0–0x568ba): two
   * pass-through nodes linked to it and to each other, and a barrier between two more.
   */
  addLuggage(node: Point, aux: readonly [Point, Point], barrier: readonly [Point, Point]): TaxiNode {
    const conveyor = this.addNode(node, true);
    const first = this.addNode(aux[0], false);
    const second = this.addNode(aux[1], false);
    this.link(conveyor, first);
    this.link(conveyor, second);
    this.link(first, second);
    this.link(this.addNode(barrier[0], true), this.addNode(barrier[1], true));
    return conveyor;
  }

  /**
   * A hangar's node and the nodes its constructor adds (0x46e44): the exit node 10 px right and
   * 20 px below, where a serviced plane waits, linked to it; two pass-through nodes beside the
   * exit, linked to it and to each other; and a barrier behind, from 40 px right to 60 px left,
   * 15 px above.
   */
  addHangar(node: Point): { hangar: TaxiNode; exit: TaxiNode } {
    const hangar = this.addNode(node, true);
    const exit = this.addNode({ x: node.x + 10, y: node.y + 20 }, false);
    const left = this.addNode({ x: node.x - 10, y: node.y + 30 }, false);
    const right = this.addNode({ x: node.x + 50, y: node.y + 30 }, false);
    this.link(hangar, exit);
    this.link(exit, left);
    this.link(exit, right);
    this.link(left, right);
    this.link(this.addNode({ x: node.x + 40, y: node.y - 15 }, true), this.addNode({ x: node.x - 60, y: node.y - 15 }, true));
    return { hangar, exit };
  }

  /**
   * A stop spot's node and the six pass-through nodes its constructor adds (0x78dc6): three
   * 15 px above it, left free, and three 15 px below, each linked to the spot and to the one
   * beside it.
   */
  addStopSpot(node: Point): TaxiNode {
    const spot = this.addNode(node, true);
    for (const dx of [-30, -10, 10]) this.addNode({ x: node.x + dx, y: node.y - 15 }, false);
    const below = [-10, 10, 30].map((dx) => this.addNode({ x: node.x + dx, y: node.y + 15 }, false));
    for (const other of below) this.link(spot, other);
    this.link(below[0]!, below[1]!);
    this.link(below[1]!, below[2]!);
    return spot;
  }

  /**
   * A runway's nodes (runway constructor, 0x6d0d2): its own node at one end, a second terminal
   * node at the other, a ring of pass-through nodes around each, and two free nodes.
   * `nodeSide` is -1 when the runway's node is at the left end.
   */
  addRunway(centre: Point, nodeSide: 1 | -1, nodeOffset: number): TaxiNode {
    const own = this.addNode({ x: centre.x + nodeSide * nodeOffset, y: centre.y }, true);
    const far = this.addNode({ x: centre.x - nodeSide * nodeOffset, y: centre.y }, true);
    this.link(own, far);
    const ring = (side: 1 | -1, end: TaxiNode): void => {
      RING_X.forEach((x, k) => {
        this.link(end, this.addNode({ x: centre.x + side * x, y: centre.y + side * RING_Y[k]! }, false));
      });
    };
    // Set 1 holds the negative offsets with the listed y; set 2 mirrors both.
    ring(-1, nodeSide < 0 ? own : far);
    ring(1, nodeSide < 0 ? far : own);
    for (const extra of RUNWAY_EXTRA) this.addNode({ x: centre.x + extra.x, y: centre.y + extra.y }, false);
    return own;
  }

  /**
   * `0x46230`: shortest path by distance. Terminal nodes are only usable as the destination, and
   * a node some plane holds is not used at all, the destination included, unless `throughHeld`.
   */
  route(from: TaxiNode, to: TaxiNode, throughHeld = false): TaxiNode[] | null {
    const distance = new Map<TaxiNode, number>([[from, 0]]);
    const previous = new Map<TaxiNode, TaxiNode>();
    const done = new Set<TaxiNode>();
    for (;;) {
      let current: TaxiNode | null = null;
      for (const [node, d] of distance) {
        if (!done.has(node) && (current === null || d < distance.get(current)!)) current = node;
      }
      if (current === null) return null;
      if (current === to) break;
      done.add(current);
      for (const next of current.links) {
        if (done.has(next)) continue;
        if (!throughHeld && next.occupied) continue;
        if (next.terminal && next !== to) continue;
        const d = distance.get(current)! + Math.hypot(next.x - current.x, next.y - current.y);
        if (d < (distance.get(next) ?? Infinity)) {
          distance.set(next, d);
          previous.set(next, current);
        }
      }
    }
    const path: TaxiNode[] = [to];
    while (path[0] !== from) path.unshift(previous.get(path[0]!)!);
    return path;
  }
}

function side(p: Point, q: Point, r: Point): number {
  return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
}

/** Proper intersection of segments ab and cd, with a small tolerance for near-touching ends. */
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = side(a, b, c);
  const d2 = side(a, b, d);
  const d3 = side(c, d, a);
  const d4 = side(c, d, b);
  const t = CROSS_TOLERANCE;
  const opposite = (u: number, v: number): boolean => (u > t && v < -t) || (u < -t && v > t);
  return opposite(d1, d2) && opposite(d3, d4);
}
