import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGateTable, parseRunwayTable } from '../src/data/airport';
import { findGoals, findLevel, parseLevelsDb, parseStageSchedule } from '../src/data/levels';
import { PERSPECTIVES, parsePlaneTable } from '../src/data/planes';
import { Resources, type ResourcesData } from '../src/data/resources';
import type { XmlNode } from '../src/data/xml';

const generated = path.resolve(__dirname, '../src/data/generated');
const assets = path.resolve(__dirname, '../public/assets');
const load = <T>(rel: string): T => JSON.parse(fs.readFileSync(path.join(generated, rel), 'utf8')) as T;
const tree = (rel: string): XmlNode[] => load<XmlNode[]>(rel);

const resources = new Resources(load<ResourcesData>('resources.json'));
const planes = parsePlaneTable(tree('data/descriptors/plane_descriptor_table.json'));
const gates = parseGateTable(tree('data/descriptors/gate_descriptor_table.json'));
const runways = parseRunwayTable(tree('data/descriptors/runway_descriptor_table.json'));
const stage1 = parseStageSchedule(tree('data/maps/stage_levels_01.json'));
const levelsDb = parseLevelsDb(tree('data/descriptors/levels_db.json'));

const exists = (id: string): boolean => fs.existsSync(path.join(assets, resources.surface(id).file));

describe('resources', () => {
  it('resolves stage 1 and its dependencies to files on disk', () => {
    expect(resources.groupClosure('STAGE_01')).toEqual(['COMERCIAL_PLANES', 'STAGE_01']);
    const ids = resources.surfacesOf('AIRPORT', 'STAGE_01');
    expect(ids.length).toBeGreaterThan(100);
    expect(ids.filter((id) => !exists(id))).toEqual([]);
  });

  it('maps .cgf surfaces to the renamed .png', () => {
    expect(resources.surface('STAGES.ARCHES.BACKGROUND_TOP').file).toBe('data/graphics/stages/arches/back_top.png');
  });

  it('keeps the gates namespace intact despite the unclosed <Surface> in the source', () => {
    expect(resources.hasSurface('HANGARS.FRONT_0')).toBe(true);
    expect(resources.hasSurface('GATES.HANGARS.FRONT_0')).toBe(false);
  });
});

describe('descriptors', () => {
  it('reads all planes, gates and runways', () => {
    expect(planes.size).toBe(20);
    expect(gates.size).toBe(28);
    expect(runways.size).toBe(9);
  });

  it('reads plane 1 exactly as authored', () => {
    const p = planes.get(1)!;
    expect(p.passengers).toBe(10);
    expect(p.patience).toBe('PATIENCE_VALUES.HIGH');
    expect(p.points).toMatchObject({ runway: 750, gate: 450, leaving: 500 });
    expect(p.times).toMatchObject({ loading: 8, maleEnergyFall: 26, femaleEnergyFall: 28 });
    expect(p.body.energyBarOffsetY).toBe(-60);
    expect(p.eyes.placement[1]).toEqual({ x: 2, y: -5, visible: true });
  });

  it('every plane part resolves to a surface for every perspective', () => {
    const unresolved: string[] = [];
    for (const p of planes.values()) {
      for (const persp of PERSPECTIVES) {
        const ids = [p.body.front, p.body.color, p.body.dirt, p.body.remark, p.eyes.opened, p.eyes.closed].map(
          (prefix) => `${prefix}.${persp}`,
        );
        for (const id of ids) if (!resources.hasSurface(id)) unresolved.push(id);
      }
      if (!resources.hasSurface(p.shadow)) unresolved.push(p.shadow);
    }
    expect(unresolved).toEqual([]);
  });

  it('gate 0 surfaces exist', () => {
    const g = gates.get(0)!;
    expect(g.node).toEqual({ x: 10, y: 47 });
    for (const id of [g.surfaces.front, g.surfaces.color, g.surfaces.remark]) expect(exists(id)).toBe(true);
  });
});

describe('levels', () => {
  it('reads the level 1-1 schedule', () => {
    const level = findLevel(stage1, 1, false);
    expect(level.totalTime).toBe(70);
    expect(level.planes.map((p) => [p.type, p.time, p.color, p.side, p.sex])).toEqual([
      [1, 1, 'BLUE', 'LEFT', 'FEMALE'],
      [1, 23, 'BLUE', 'LEFT', 'FEMALE'],
      [1, 33, 'PINK', 'RIGHT', 'MALE'],
      [2, 42, 'BLUE', 'LEFT', 'FEMALE'],
      [1, 56, 'PINK', 'RIGHT', 'FEMALE'],
    ]);
    for (const p of level.planes) expect(planes.has(p.type)).toBe(true);
  });

  it('reads the level 1-1 goals', () => {
    const area = levelsDb.get(1)!;
    expect(area.music).toBe('MUSICS.STAGE1');
    expect(findGoals(area, 1, false)).toMatchObject({ goal: 6000, expert: 10000, master: 15000, supreme: 20000, perfect: 24000 });
  });
});
