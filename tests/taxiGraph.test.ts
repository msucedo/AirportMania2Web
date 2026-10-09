import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGateTable } from '../src/data/airport';
import type { XmlNode } from '../src/data/xml';
import { TaxiGraph } from '../src/game/sim/taxiGraph';
import { ARCHES } from '../src/game/stages/arches';

const generated = path.resolve(__dirname, '../src/data/generated');
const gates = parseGateTable(JSON.parse(fs.readFileSync(path.join(generated, 'data/descriptors/gate_descriptor_table.json'), 'utf8')) as XmlNode[]);

describe('taxi graph rules', () => {
  it('refuses a link when another node sits on the segment', () => {
    const graph = new TaxiGraph();
    const a = graph.addNode({ x: 0, y: 0 }, false);
    const b = graph.addNode({ x: 100, y: 0 }, false);
    graph.addNode({ x: 50, y: 5 }, false);
    expect(graph.link(a, b)).toBe(false);
    const c = graph.addNode({ x: 50, y: 40 }, false);
    expect(graph.link(a, c)).toBe(true);
  });

  it('refuses a link that would cross an existing one', () => {
    const graph = new TaxiGraph();
    const a = graph.addNode({ x: 0, y: 0 }, false);
    const b = graph.addNode({ x: 100, y: 100 }, false);
    const c = graph.addNode({ x: 0, y: 100 }, false);
    const d = graph.addNode({ x: 100, y: 0 }, false);
    expect(graph.link(a, b)).toBe(true);
    expect(graph.link(c, d)).toBe(false);
  });

  it('never routes through a terminal node', () => {
    const graph = new TaxiGraph();
    const a = graph.addNode({ x: 0, y: 0 }, false);
    const place = graph.addNode({ x: 50, y: 0 }, true);
    const b = graph.addNode({ x: 100, y: 0 }, false);
    const detour = graph.addNode({ x: 50, y: 60 }, false);
    graph.link(a, place);
    graph.link(place, b);
    graph.link(a, detour);
    graph.link(detour, b);
    expect(graph.route(a, b)).toEqual([a, detour, b]);
    expect(graph.route(a, place)).toEqual([a, place]);
  });
});

describe('Arches taxi graph', () => {
  const graph = new TaxiGraph();
  const gateNodes = ARCHES.gates
    .filter((slot) => slot.requires === null)
    .map((slot) => {
      const d = gates.get(ARCHES.gateTypes[0])!;
      const at = (p: { x: number; y: number }) => ({ x: slot.position.x + p.x, y: slot.position.y + p.y });
      return graph.addGate(at(d.node), d.friendNodes.map(at));
    });
  for (const node of ARCHES.taxiNodes) graph.addNode(node, false);
  const runwayNodes = ARCHES.runways.map((slot) => graph.addRunway(slot.position, -1, 144));
  graph.autoLink();

  it('has the expected nodes and leaves none unconnected', () => {
    // 2 gates x (1 + 3 friends) + 5 taxi nodes + 2 runways x (2 ends + 14 ring + 2 free).
    expect(graph.nodes).toHaveLength(2 * 4 + 5 + 2 * 18);
    expect(graph.nodes.filter((n) => n.terminal)).toHaveLength(6);
    expect(graph.nodes.filter((n) => n.links.length === 0)).toEqual([]);
  });

  it('places the runway nodes where the constructor does', () => {
    expect(runwayNodes.map((n) => [n.x, n.y])).toEqual([
      [306, 225],
      [351, 270],
    ]);
    const has = (x: number, y: number) => graph.nodes.some((n) => n.x === x && n.y === y);
    expect(has(594, 225)).toBe(true);
    expect(has(248, 211)).toBe(true);
    expect(has(437, 211)).toBe(true);
  });

  it('routes between every runway and gate, close to the straight-line distance', () => {
    for (const runway of runwayNodes) {
      for (const gate of gateNodes) {
        for (const [from, to] of [
          [runway, gate],
          [gate, runway],
        ] as const) {
          const route = graph.route(from, to);
          expect(route).not.toBeNull();
          const length = route!.slice(1).reduce((sum, n, i) => sum + Math.hypot(n.x - route![i]!.x, n.y - route![i]!.y), 0);
          const straight = Math.hypot(from.x - to.x, from.y - to.y);
          expect(length).toBeGreaterThanOrEqual(straight - 0.001);
          expect(length).toBeLessThan(straight * 1.15);
          expect(route!.slice(1, -1).every((n) => !n.terminal)).toBe(true);
        }
      }
    }
  });
});
