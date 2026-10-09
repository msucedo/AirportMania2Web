import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGasStationTable, parseGateTable, parseRunwayTable } from '../src/data/airport';
import { findGoals, findLevel, parseLevelsDb, parseStageSchedule } from '../src/data/levels';
import { parsePlaneTable } from '../src/data/planes';
import type { XmlNode } from '../src/data/xml';
import { Need, PlaneState, RULES, punctuality, roundScore } from '../src/game/sim/rules';
import { Simulation, type Plane, type SimEvent } from '../src/game/sim/simulation';
import { ARCHES } from '../src/game/stages/arches';

const generated = path.resolve(__dirname, '../src/data/generated');
const tree = (rel: string): XmlNode[] => JSON.parse(fs.readFileSync(path.join(generated, rel), 'utf8')) as XmlNode[];

const planes = parsePlaneTable(tree('data/descriptors/plane_descriptor_table.json'));
const gates = parseGateTable(tree('data/descriptors/gate_descriptor_table.json'));
const runways = parseRunwayTable(tree('data/descriptors/runway_descriptor_table.json'));
const gasStations = parseGasStationTable(tree('data/descriptors/gas_station_descriptor_table.json'));
const stage = parseStageSchedule(tree('data/maps/stage_levels_01.json'));
const area = parseLevelsDb(tree('data/descriptors/levels_db.json')).get(1)!;

function newSim(level = 1): Simulation {
  return new Simulation({
    layout: ARCHES,
    schedule: findLevel(stage, level, false),
    goals: findGoals(area, level, false),
    planes,
    gates,
    runways,
    gasStations,
    level,
    screenWidth: 480,
  });
}

const DT = 1 / 60;
function run(sim: Simulation, seconds: number, events: SimEvent[] = []): SimEvent[] {
  for (let t = 0; t < seconds; t += DT) {
    sim.update(DT);
    events.push(...sim.drainEvents());
  }
  return events;
}
function runUntil(sim: Simulation, done: () => boolean, limit = 120, events: SimEvent[] = []): SimEvent[] {
  for (let t = 0; t < limit && !done(); t += DT) {
    sim.update(DT);
    events.push(...sim.drainEvents());
  }
  if (!done()) throw new Error('condition not reached');
  return events;
}

describe('rules', () => {
  it('rounds scores down to a multiple of 5', () => {
    expect(roundScore(749.9)).toBe(745);
    expect(roundScore(750)).toBe(750);
    expect(roundScore(4)).toBe(0);
  });

  it('classifies punctuality by energy', () => {
    expect(punctuality(0.29)).toBe('LATE');
    expect(punctuality(0.3)).toBe('ON_TIME');
    expect(punctuality(0.59)).toBe('ON_TIME');
    expect(punctuality(0.6)).toBe('EARLY');
  });
});

describe('simulation, level 1-1', () => {
  it('builds the airport from the layout: two gates, two runways', () => {
    const sim = newSim();
    expect(sim.gates.map((g) => g.letter)).toEqual(['A', 'B']);
    expect(sim.gates[0]!.node).toEqual({ x: 50, y: 169 });
    expect(sim.runways.map((r) => r.node)).toEqual([
      { x: 306, y: 225 },
      { x: 351, y: 270 },
    ]);
  });

  it('spawns planes on schedule with full energy, flying', () => {
    const sim = newSim();
    const events = run(sim, 1.1);
    expect(events.filter((e) => e.type === 'spawn')).toHaveLength(1);
    const plane = sim.planes[0]!;
    expect(plane.state).toBe(PlaneState.FLYING);
    expect(plane.color).toBe('BLUE');
    expect(plane.energy).toBeCloseTo(RULES.initialEnergy, 1);
  });

  it('drains energy only while flying or waiting', () => {
    const sim = newSim();
    run(sim, 1.05);
    const plane = sim.planes[0]!;
    const before = plane.energy;
    run(sim, 2);
    // Plane 1, female: 28 s to drain one full unit.
    expect(before - plane.energy).toBeCloseTo(2 / 28, 2);
  });

  it('rejects a gate as the first order of a flying plane and accepts a runway', () => {
    const sim = newSim();
    run(sim, 1.1);
    const plane = sim.planes[0]!;
    expect(sim.addOrder(plane, sim.gates[0]!)).toBe(false);
    expect(sim.addOrder(plane, sim.runways[0]!)).toBe(true);
    // One runway and one gate per itinerary.
    expect(sim.addOrder(plane, sim.runways[1]!)).toBe(false);
    expect(sim.addOrder(plane, sim.gates[0]!)).toBe(true);
    expect(sim.addOrder(plane, sim.gates[1]!)).toBe(false);
  });

  it('lets the gate be queued during the landing approach', () => {
    const sim = newSim();
    run(sim, 1.1);
    const plane = sim.planes[0]!;
    sim.addOrder(plane, sim.runways[0]!);
    runUntil(sim, () => plane.landing, 5);
    expect(plane.state).toBe(PlaneState.FLYING);
    expect(sim.addOrder(plane, sim.gates[0]!)).toBe(true);
    runUntil(sim, () => plane.state === PlaneState.UNLOADING, 30);
  });

  it('makes a second plane circle until the runway it was sent to is free', () => {
    const sim = newSim();
    run(sim, 23.2);
    const [first, second] = sim.planes as [Plane, Plane];
    const runway = sim.runways[0]!;
    sim.addOrder(first, runway);
    runUntil(sim, () => first.state === PlaneState.WAITING, 30);
    expect(sim.addOrder(second, runway)).toBe(true);
    run(sim, 2);
    expect(second.landing).toBe(false);
    sim.addOrder(first, sim.gates[0]!);
    runUntil(sim, () => second.landing, 10);
  });

  it('plays one plane through landing, unloading, loading and take-off with the expected scores', () => {
    const sim = newSim();
    run(sim, 1.1);
    const plane = sim.planes[0]!;
    const [gateA, gateB] = sim.gates as [(typeof sim.gates)[0], (typeof sim.gates)[0]];
    const runway = sim.runways[0]!;
    const events: SimEvent[] = [];
    const scores = (): number[] => events.filter((e) => e.type === 'score').map((e) => (e as { points: number }).points);

    // Land. Energy is still above 1, so the landing is worth the full RunwayPoints.
    expect(sim.addOrder(plane, runway)).toBe(true);
    runUntil(sim, () => plane.state === PlaneState.WAITING, 30, events);
    expect(scores()).toEqual([750]);
    expect(plane.altitude).toBe(0);
    expect({ x: plane.x, y: plane.y }).toEqual(runway.node);

    // The runway cannot be ordered again from the runway, nor before unloading.
    expect(sim.addOrder(plane, sim.runways[1]!)).toBe(false);

    // Unload at gate A: full GatePoints, first plane of its colour so no multiplier.
    expect(sim.addOrder(plane, gateA)).toBe(true);
    runUntil(sim, () => plane.state === PlaneState.UNLOADING, 30, events);
    expect(runway.use).toBe('free');
    expect(scores()).toEqual([750, 450]);
    expect(gateA.lastColor).toBe('BLUE');
    expect(sim.counts.unload.EARLY).toBe(1);
    const started = sim.time;

    // Loading follows on the same gate without an order, and scores the gate a second time
    // without building the colour combo.
    runUntil(sim, () => plane.state === PlaneState.LOADING, 30, events);
    // LoadingTime 8 s at gate speed 1.0.
    expect(sim.time - started).toBeCloseTo(8, 1);
    expect(plane.unloaded).toBe(true);
    expect(scores()).toEqual([750, 450, 450]);
    expect(gateA.combo).toBe(1);

    // While loading, another gate is refused but the take-off can be queued.
    expect(sim.addOrder(plane, gateB)).toBe(false);
    expect(sim.addOrder(plane, runway)).toBe(true);
    runUntil(sim, () => plane.state === PlaneState.TAKING_OFF, 30, events);
    expect(plane.loaded).toBe(true);
    expect(gateA.service).toBe('idle');
    runUntil(sim, () => plane.gone, 30, events);
    expect(events.some((e) => e.type === 'takeOff')).toBe(true);
    expect(sim.planesServed).toBe(1);
    expect(runway.use).toBe('free');

    // Energy never dropped below 1, so every award is the full descriptor value.
    expect(scores()).toEqual([750, 450, 450, 750]);
    expect(sim.score).toBe(2400);
  });

  it('builds the gate colour multiplier for consecutive planes of one colour', () => {
    const sim = newSim();
    // The first two arrivals are both blue (t=1 and t=23).
    run(sim, 23.2);
    const [first, second] = sim.planes as [Plane, Plane];
    const gateA = sim.gates[0]!;
    const events: SimEvent[] = [];
    for (const plane of [first, second]) {
      const runway = plane === first ? sim.runways[0]! : sim.runways[1]!;
      sim.addOrder(plane, runway);
      runUntil(sim, () => plane.state === PlaneState.WAITING, 40, events);
    }
    sim.addOrder(first, gateA);
    runUntil(sim, () => first.state === PlaneState.LOADING, 40, events);
    // The second plane may be sent to the busy gate; it waits its turn.
    expect(sim.addOrder(second, gateA)).toBe(true);
    run(sim, 1, events);
    expect(second.state).toBe(PlaneState.WAITING);
    sim.addOrder(first, sim.runways[0]!);
    runUntil(sim, () => second.state === PlaneState.UNLOADING, 40, events);

    expect(gateA.combo).toBe(2);
    const gateScores = events.filter((e) => e.type === 'score' && e.reason === 'gate' && e.plane === second);
    expect(gateScores).toHaveLength(1);
    const award = gateScores[0] as { points: number; multiplier: number };
    expect(award.multiplier).toBe(2);
    // The plane waited on the runway, so it may have lost some energy before reaching the gate.
    expect(award.points % 5).toBe(0);
    expect(award.points).toBeGreaterThan(450);
    expect(award.points).toBeLessThanOrEqual(900);
  });

  it('doubles the second landing on a runway inside the combo window, and not outside it', () => {
    const landingAward = (events: SimEvent[], plane: Plane) =>
      events.find((e) => e.type === 'score' && e.reason === 'landing' && e.plane === plane) as { points: number; multiplier: number };

    // Arrivals at t=33 (type 1) and t=42 (type 2) land about 8 s apart: inside the 12.8 s window.
    const sim = newSim();
    const events: SimEvent[] = [];
    run(sim, 33.2, events);
    const third = sim.planes[2]!;
    sim.addOrder(third, sim.runways[0]!);
    sim.addOrder(third, sim.gates[0]!);
    run(sim, 9, events);
    const fourth = sim.planes[3]!;
    sim.addOrder(fourth, sim.runways[0]!);
    runUntil(sim, () => fourth.landed, 20, events);
    expect(landingAward(events, third)).toMatchObject({ points: 750, multiplier: 1 });
    expect(landingAward(events, fourth)).toMatchObject({ points: 2500, multiplier: 2 });

    // Arrivals at t=1 and t=23 land about 22 s apart: the combo has run out.
    const late = newSim();
    const lateEvents: SimEvent[] = [];
    run(late, 1.2, lateEvents);
    const first = late.planes[0]!;
    late.addOrder(first, late.runways[0]!);
    late.addOrder(first, late.gates[0]!);
    run(late, 22, lateEvents);
    const second = late.planes[1]!;
    late.addOrder(second, late.runways[0]!);
    runUntil(late, () => second.landed, 20, lateEvents);
    expect(landingAward(lateEvents, second)).toMatchObject({ points: 750, multiplier: 1 });
  });

  it('lets an ignored plane leave angry and ends the level when the airport is empty', () => {
    const sim = newSim();
    const events = runUntil(sim, () => sim.ended, 400);
    expect(sim.planesLost).toBe(5);
    // Each lost plane costs its LeavingPoints: four of type 1 (500) and one of type 2 (750).
    expect(sim.score).toBe(-2750);
    expect(events.at(-1)).toEqual({ type: 'levelEnd', score: -2750 });
  });
});

describe('simulation, level 1-3 (fuel)', () => {
  it('has a gas station from level 3 on, wired into the taxi graph', () => {
    expect(newSim(1).gasStations).toHaveLength(0);
    expect(newSim(2).gasStations).toHaveLength(0);
    const sim = newSim(3);
    expect(sim.gasStations).toHaveLength(1);
    const station = sim.gasStations[0]!;
    expect(station.node).toEqual({ x: 296, y: 164 });
    for (const gate of sim.gates) expect(sim.graph.route(gate.taxiNode, station.taxiNode)).not.toBeNull();
    for (const runway of sim.runways) expect(sim.graph.route(station.taxiNode, runway.taxiNode)).not.toBeNull();
  });

  it('takes a plane that needs fuel through unload, fuel, load and take-off', () => {
    const sim = newSim(3);
    const events: SimEvent[] = [];
    // Run until the first plane that needs fuel has arrived.
    runUntil(sim, () => sim.planes.some((p) => !p.gasDone), 200, events);
    const plane = sim.planes.find((p) => !p.gasDone)!;
    const [gateA, gateB] = sim.gates as [(typeof sim.gates)[0], (typeof sim.gates)[0]];
    const station = sim.gasStations[0]!;
    const runway = sim.runways[1]!;
    expect(plane.need).toBe(Need.LAND);

    // The gas station is refused before the plane has unloaded.
    expect(sim.addOrder(plane, runway)).toBe(true);
    expect(sim.addOrder(plane, station)).toBe(false);
    expect(sim.addOrder(plane, gateB)).toBe(true);
    runUntil(sim, () => plane.unloaded, 60, events);

    // No automatic loading this time: the plane waits at the gate asking for fuel.
    expect(plane.state).toBe(PlaneState.WAITING);
    expect(plane.need).toBe(Need.GAS);
    run(sim, 1, events);
    expect(plane.state).toBe(PlaneState.WAITING);
    // It cannot load or leave yet.
    expect(sim.addOrder(plane, gateA)).toBe(false);
    expect(sim.addOrder(plane, runway)).toBe(false);

    expect(sim.addOrder(plane, station)).toBe(true);
    runUntil(sim, () => plane.state === PlaneState.FUELING, 30, events);
    expect(gateB.service).toBe('idle');
    const started = sim.time;
    runUntil(sim, () => plane.gasDone, 60, events);
    expect(sim.time - started).toBeCloseTo(plane.descriptor.times.fueling, 1);
    expect(plane.need).toBe(Need.LOAD);
    const fuel = events.filter((e) => e.type === 'score' && e.reason === 'gas' && e.plane === plane) as { points: number }[];
    expect(fuel).toHaveLength(1);
    expect(fuel[0]!.points % 5).toBe(0);
    expect(fuel[0]!.points).toBeLessThanOrEqual(plane.descriptor.points.gasStation);
    // A second visit to the pump is refused.
    expect(sim.addOrder(plane, station)).toBe(false);

    // Load at a gate, then take off.
    expect(sim.addOrder(plane, gateA)).toBe(true);
    runUntil(sim, () => plane.state === PlaneState.LOADING, 30, events);
    expect(station.use).toBe('free');
    expect(sim.addOrder(plane, runway)).toBe(true);
    runUntil(sim, () => plane.gone, 60, events);
    expect(plane.loaded).toBe(true);
    expect(sim.planesServed).toBeGreaterThanOrEqual(1);
  });

  it('lets fuel and the loading gate be queued once the plane has left its gate', () => {
    const sim = newSim(3);
    runUntil(sim, () => sim.planes.some((p) => !p.gasDone), 200);
    const plane = sim.planes.find((p) => !p.gasDone)!;
    const station = sim.gasStations[0]!;
    sim.addOrder(plane, sim.runways[0]!);
    sim.addOrder(plane, sim.gates[0]!);
    runUntil(sim, () => plane.unloaded, 60);
    sim.addOrder(plane, station);
    runUntil(sim, () => plane.state === PlaneState.TAXIING, 10);
    // On the way to the pump: a gate is accepted because fuel is already in the itinerary.
    expect(sim.addOrder(plane, sim.gates[1]!)).toBe(true);
    expect(sim.addOrder(plane, sim.runways[0]!)).toBe(true);
    runUntil(sim, () => plane.gone, 120);
    expect(plane.gasDone && plane.loaded).toBe(true);
  });
});

describe('simulation, stop spot', () => {
  it('parks a landed plane, halves its energy drain and lets it go on to a gate', () => {
    const sim = newSim(1);
    run(sim, 1.1);
    const plane = sim.planes[0]!;
    const spot = sim.stopSpots[0]!;
    expect(sim.stopSpots).toHaveLength(1);
    expect(spot.drain).toBe(0.5);

    // A circling plane needs its landing queued before the spot.
    expect(sim.addOrder(plane, spot)).toBe(false);
    expect(sim.addOrder(plane, sim.runways[0]!)).toBe(true);
    expect(sim.addOrder(plane, spot)).toBe(true);
    runUntil(sim, () => spot.use === 'occupied', 40);
    expect(plane.state).toBe(PlaneState.WAITING);
    expect(sim.runways[0]!.use).toBe('free');

    const before = plane.energy;
    run(sim, 4);
    // Plane 1, female: 28 s per unit of energy, at half rate while parked.
    expect(before - plane.energy).toBeCloseTo((4 / 28) * 0.5, 2);

    expect(sim.addOrder(plane, sim.gates[0]!)).toBe(true);
    runUntil(sim, () => plane.state === PlaneState.UNLOADING, 40);
    expect(spot.use).toBe('free');
    expect(spot.plane).toBeNull();
  });

  it('refuses the spot after a gate is planned and before the plane has unloaded', () => {
    const sim = newSim(1);
    run(sim, 1.1);
    const plane = sim.planes[0]!;
    sim.addOrder(plane, sim.runways[0]!);
    sim.addOrder(plane, sim.gates[0]!);
    expect(sim.addOrder(plane, sim.stopSpots[0]!)).toBe(false);
  });

  it('keeps a second plane waiting while the spot is taken', () => {
    const sim = newSim(1);
    run(sim, 23.2);
    const [first, second] = sim.planes as [Plane, Plane];
    const spot = sim.stopSpots[0]!;
    sim.addOrder(first, sim.runways[0]!);
    sim.addOrder(first, spot);
    runUntil(sim, () => spot.use === 'occupied', 40);
    sim.addOrder(second, sim.runways[1]!);
    sim.addOrder(second, spot);
    runUntil(sim, () => second.landed, 40);
    run(sim, 3);
    expect(second.state).toBe(PlaneState.WAITING);
    expect(spot.plane).toBe(first);
    sim.addOrder(first, sim.gates[0]!);
    runUntil(sim, () => spot.plane === second && spot.use === 'occupied', 40);
  });
});

