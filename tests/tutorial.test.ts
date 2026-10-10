import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGasStationTable, parseGateTable, parseHangarTable, parseLuggageTable, parseRunwayTable } from '../src/data/airport';
import { findGoals, findLevel, parseLevelsDb, parseStageSchedule } from '../src/data/levels';
import { parsePlaneTable } from '../src/data/planes';
import type { XmlNode } from '../src/data/xml';
import { Need, PlaneState } from '../src/game/sim/rules';
import { Simulation, type Place, type Plane } from '../src/game/sim/simulation';
import { BasicSequenceTutorial, CombosTutorial, ExtrasTutorial, tutorialFor, type Tutorial } from '../src/game/sim/tutorial';
import { stageLayout, STAGES, TUTORIAL } from '../src/game/stages';

const generated = path.resolve(__dirname, '../src/data/generated');
const tree = (rel: string): XmlNode[] => JSON.parse(fs.readFileSync(path.join(generated, rel), 'utf8')) as XmlNode[];

const tables = {
  planes: parsePlaneTable(tree('data/descriptors/plane_descriptor_table.json')),
  gates: parseGateTable(tree('data/descriptors/gate_descriptor_table.json')),
  runways: parseRunwayTable(tree('data/descriptors/runway_descriptor_table.json')),
  gasStations: parseGasStationTable(tree('data/descriptors/gas_station_descriptor_table.json')),
  hangars: parseHangarTable(tree('data/descriptors/hangar_descriptor_table.json')),
  luggages: parseLuggageTable(tree('data/descriptors/luggage_descriptor_table.json')),
};
const schedule = parseStageSchedule(tree('data/maps/stage_levels_00.json'));
const area = parseLevelsDb(tree('data/descriptors/levels_db.json')).get(0)!;

const academy = (day: number): Simulation => new Simulation({ layout: TUTORIAL, schedule: findLevel(schedule, day, false), goals: findGoals(area, day, false), ...tables, level: day, screenWidth: 480, random: () => 0.5 });

/**
 * Plays a day to its end, the tutorial hearing every event. `gateFor` says which gate a plane
 * unloads at; everything else goes wherever the plane needs next.
 */
function play(sim: Simulation, tutorial: Tutorial, gateFor: (plane: Plane, sim: Simulation) => Place = (_p, s) => s.gates.find((g) => !s.planes.some((q) => !q.gone && (q.place === g || q.queue.includes(g)))) ?? s.gates[0]!): string[] {
  const hints: string[] = [];
  for (let i = 0; i < 60 * 400 && !sim.ended; i++) {
    for (const p of sim.planes) {
      if (p.gone || p.queue.length > 0) continue;
      if (!p.landed) {
        if (p.state === PlaneState.FLYING) sim.addOrder(p, sim.runways[0]!);
        continue;
      }
      if (p.state !== PlaneState.WAITING) continue;
      const wanted = p.need === Need.UNLOAD ? gateFor(p, sim) : p.need === Need.LOAD ? (sim.gates.find((g) => g.plane === p) ?? gateFor(p, sim)) : p.need === Need.GAS ? sim.gasStations[0] : p.need === Need.SERVICE ? sim.hangars[0] : p.need === Need.LUGGAGE ? sim.luggages[0] : p.need === Need.TAKE_OFF ? sim.runways[0] : undefined;
      if (wanted) sim.addOrder(p, wanted);
    }
    sim.update(1 / 60);
    for (const event of sim.drainEvents()) tutorial.handle(event);
    tutorial.update(1 / 60);
    hints.push(...tutorial.hints.splice(0).map((h) => `${h.image}|${h.text}`));
  }
  expect(sim.ended).toBe(true);
  return hints;
}

describe('the tutorial', () => {
  it('is stage 0, apart from the ten stages, with what its script builds', () => {
    expect(stageLayout(0)).toBe(TUTORIAL);
    expect(STAGES.has(0)).toBe(false);
    expect(area.levelsCount).toBe(3);
    const first = academy(1);
    expect(first.gates.map((g) => [g.letter, g.descriptor.type, g.position])).toEqual([
      ['A', 24, { x: 320, y: 133 }],
      ['B', 24, { x: 400, y: 133 }],
    ]);
    expect(first.runways.map((r) => [r.number, r.descriptor.type, r.position])).toEqual([[1, 1, { x: 95, y: 205 }]]);
    expect([first.gasStations.length, first.hangars.length, first.luggages.length, first.stopSpots.length]).toEqual([0, 0, 0, 1]);
    // The pump, the hangar and the conveyor come on the third day.
    const third = academy(3);
    expect([third.gasStations[0]!.descriptor.type, third.hangars[0]!.descriptor.type, third.luggages[0]!.descriptor.type]).toEqual([12, 13, 0]);
    for (const place of [...third.gates, ...third.gasStations, ...third.hangars, ...third.luggages, ...third.stopSpots]) expect(third.graph.route(third.runways[0]!.taxiNode, place.taxiNode)).not.toBeNull();
  });

  it('makes the class of each day', () => {
    expect([tutorialFor(1), tutorialFor(2), tutorialFor(3)].map((t) => [t.constructor, t.goals.length])).toEqual([
      [BasicSequenceTutorial, 4],
      [CombosTutorial, 2],
      [ExtrasTutorial, 3],
    ]);
    expect(() => tutorialFor(4)).toThrow();
  });

  it('day 1: tells each step of one plane and ticks its four goals', () => {
    const sim = academy(1);
    const tutorial = tutorialFor(1);
    const hints = play(sim, tutorial);
    // The first comes because nobody selects the plane here: it is ordered about directly.
    expect(hints).toEqual([
      'HINTS.PLANE|HINTS.NEED_TO_SELECT',
      'HINTS.GATE_0|HINTS.TUTORIAL_FINISHED_LANDING',
      'HINTS.UNLOADING|HINTS.TUTORIAL_START_UNLOADING',
      'HINTS.LOADING|HINTS.TUTORIAL_FINISHED_UNLOADING',
      'HINTS.RUNWAY|HINTS.TUTORIAL_FINISHED_LOADING',
    ]);
    tutorial.finish();
    expect(tutorial.goals.map((g) => g.state)).toEqual(['done', 'done', 'done', 'done']);
    expect(tutorial.passed(sim.score)).toBe(true);
    // Nothing scored is a fail whatever the goals say.
    expect(tutorial.passed(0)).toBe(false);
  });

  it('day 1: says to select the plane after three seconds, and what to do once selected', () => {
    const sim = academy(1);
    const tutorial = tutorialFor(1);
    const step = (seconds: number): string[] => {
      const out: string[] = [];
      for (let t = 0; t < seconds; t += 1 / 60) {
        sim.update(1 / 60);
        for (const event of sim.drainEvents()) tutorial.handle(event);
        tutorial.update(1 / 60);
        out.push(...tutorial.hints.splice(0).map((h) => h.text));
      }
      return out;
    };
    // The plane appears at one second; three more go by before the hint.
    expect(step(3.5)).toEqual([]);
    expect(step(1)).toEqual(['HINTS.NEED_TO_SELECT']);
    expect(step(5)).toEqual([]);
    const plane = sim.planes[0]!;
    sim.select(plane);
    expect(step(0.1)).toEqual(['HINTS.TUTORIAL_SELECTED']);
    // Left alone, the day ends with every goal failed.
    for (let i = 0; i < 60 * 300 && !sim.ended; i++) sim.update(1 / 60);
    tutorial.finish();
    expect(tutorial.goals.map((g) => g.state)).toEqual(['failed', 'failed', 'failed', 'failed']);
    expect(tutorial.passed(sim.score)).toBe(false);
  });

  it('day 2: passes with a runway combo and the same colour twice at each gate', () => {
    const sim = academy(2);
    const tutorial = tutorialFor(2);
    // Blue to gate A and green to gate B, both times.
    const hints = play(sim, tutorial, (plane, s) => (plane.color === 'BLUE' ? s.gates[0]! : s.gates[1]!));
    expect(hints).toContain('HINTS.TUTORIAL_LANDING_COMBO|HINTS.TUTORIAL_TO_GET_A_LANDING_COMBO');
    expect(hints.filter((h) => h.startsWith('HINTS.TUTORIAL_GATE_COMBO_X2'))).toHaveLength(1);
    expect(tutorial.goals[1]).toMatchObject({ count: 2, state: 'done' });
    expect(tutorial.goals[0]!.state).toBe('done');
    tutorial.finish();
    expect(tutorial.passed(sim.score)).toBe(true);
  });

  it('day 2: fails the gates goal when a plane goes to a gate of another colour', () => {
    const sim = academy(2);
    const tutorial = tutorialFor(2);
    // Everything to gate A: green follows blue there.
    play(sim, tutorial, (_plane, s) => s.gates[0]!);
    expect(tutorial.goals[1]!.state).toBe('failed');
    tutorial.finish();
    expect(tutorial.passed(sim.score)).toBe(false);
  });

  it('day 3: explains each need once and counts two repairs, two refuels and two loads of luggage', () => {
    const sim = academy(3);
    const tutorial = tutorialFor(3);
    const hints = play(sim, tutorial);
    expect(hints.filter((h) => h.startsWith('HINTS.HANGAR_0'))).toEqual(['HINTS.HANGAR_0|HINTS.NEED_TO_BE_REPAIRED']);
    expect(hints.filter((h) => h.startsWith('HINTS.GAS_STATION_0'))).toEqual(['HINTS.GAS_STATION_0|HINTS.NEED_TO_BE_FUELED']);
    expect(hints.filter((h) => h.startsWith('HINTS.LUGGAGE_0'))).toEqual(['HINTS.LUGGAGE_0|HINTS.NEED_TO_BE_LOADED_WITH_LUGGAGE']);
    expect(tutorial.goals.map((g) => [g.count, g.state])).toEqual([
      [2, 'done'],
      [2, 'done'],
      [2, 'done'],
    ]);
    tutorial.finish();
    expect(tutorial.passed(sim.score)).toBe(true);
  });
});
