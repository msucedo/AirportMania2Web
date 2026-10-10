import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGasStationTable, parseGateTable, parseHangarTable, parseLuggageTable, parseRunwayTable } from '../src/data/airport';
import { findGoals, findLevel, parseLevelsDb, parseStageSchedule } from '../src/data/levels';
import { parsePlaneTable } from '../src/data/planes';
import type { XmlNode } from '../src/data/xml';
import { Hint, hintFor, hintImages } from '../src/game/sim/hints';
import { Need, PlaneState, RULES, punctuality, roundScore } from '../src/game/sim/rules';
import { Simulation, type Plane, type SimEvent } from '../src/game/sim/simulation';
import { AFRICA } from '../src/game/stages/africa';
import { AIRBORNE } from '../src/game/stages/airborne';
import { STAGES } from '../src/game/stages';
import { ANTARCTIC } from '../src/game/stages/antarctic';
import { ARCHES } from '../src/game/stages/arches';
import { CARRIER } from '../src/game/stages/carrier';
import { ISLAND } from '../src/game/stages/island';
import { MARS } from '../src/game/stages/mars';
import { MONSTERS } from '../src/game/stages/monsters';
import { MOON } from '../src/game/stages/moon';
import { NORTH_POLE } from '../src/game/stages/northPole';

const generated = path.resolve(__dirname, '../src/data/generated');
const tree = (rel: string): XmlNode[] => JSON.parse(fs.readFileSync(path.join(generated, rel), 'utf8')) as XmlNode[];

const planes = parsePlaneTable(tree('data/descriptors/plane_descriptor_table.json'));
const gates = parseGateTable(tree('data/descriptors/gate_descriptor_table.json'));
const runways = parseRunwayTable(tree('data/descriptors/runway_descriptor_table.json'));
const gasStations = parseGasStationTable(tree('data/descriptors/gas_station_descriptor_table.json'));
const hangars = parseHangarTable(tree('data/descriptors/hangar_descriptor_table.json'));
const luggages = parseLuggageTable(tree('data/descriptors/luggage_descriptor_table.json'));
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
/**
 * Fog, ice and sand fall on a runway and at a moment picked at random. Stage helpers use this
 * fixed dice unless a test brings its own, so that a hazard never lands by chance on the runway
 * a test is using: with it they all go to the middle runway of the stage.
 */
const FIXED_DICE = (): number => 0.5;

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
    expect(plane.state).toBe(PlaneState.LANDING);
    expect(sim.addOrder(plane, sim.gates[0]!)).toBe(true);
    runUntil(sim, () => plane.state === PlaneState.UNLOADING, 30);
  });

  it('lands by leaving the screen, gliding down and braking onto the runway node', () => {
    const sim = newSim();
    const events: SimEvent[] = [];
    run(sim, 1.1, events);
    const plane = sim.planes[0]!;
    const runway = sim.runways[0]!;
    sim.addOrder(plane, runway);
    run(sim, DT, events);
    expect(plane.approach).toMatchObject({ phase: 0 });
    // It leaves by the side it will come back from, and the landing costs no energy.
    const energy = plane.energy;
    runUntil(sim, () => plane.approach?.phase === 2, 10, events);
    expect(plane.energy).toBe(energy);
    expect(Math.abs(plane.x - runway.node.x)).toBeCloseTo(RULES.landingApproachDistance, 0);
    expect(plane.y).toBe(runway.node.y);
    expect(plane.altitude).toBe(RULES.landing.approachAltitude);

    // It glides 600 px in 2.4 s and touches down 150 px short of the node.
    const from = sim.time;
    runUntil(sim, () => plane.approach?.phase === 3, 5, events);
    expect(sim.time - from).toBeCloseTo(2.4, 1);
    expect(plane.altitude).toBe(0);
    expect(Math.abs(plane.x - runway.node.x)).toBeCloseTo(150, -1);
    expect(plane.landed).toBe(false);

    // It glided in nose down at first and flared: 5 degrees a second from -5 over 2.4 s.
    expect(plane.pitch).toBeCloseTo(RULES.pitch.glide + RULES.pitch.flare * 2.4, 0);

    // Braking takes it exactly to the node, where the landing counts.
    runUntil(sim, () => plane.landed, 5, events);
    expect(plane.pitch).toBe(0);
    expect(plane.x).toBe(runway.node.x);
    expect(plane.state).toBe(PlaneState.WAITING);
    expect(plane.approach).toBeNull();
    const order = ['landingStarted', 'landingApproach', 'touchdown', 'landed'].map((type) => events.findIndex((e) => e.type === type));
    expect(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1]!))).toBe(true);
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

describe('simulation, holding pattern', () => {
  it('keeps a waiting plane on screen, turning between the two lanes', () => {
    const sim = newSim();
    run(sim, 1.1);
    const plane = sim.planes[0]!;
    plane.energy = 100;
    // It comes in from the left on the far lane, small.
    expect(plane.flight.phase).toBe(0);
    expect([plane.y, plane.scale]).toEqual([RULES.spawn.LEFT.y, RULES.spawn.LEFT.scale]);
    runUntil(sim, () => plane.flight.phase === 3, 10);
    // Within a frame's travel of the turning point.
    expect(plane.x - RULES.holding.rightTurn).toBeGreaterThanOrEqual(0);
    expect(plane.x - RULES.holding.rightTurn).toBeLessThan(RULES.flightSpeed * DT + 0.01);
    // The turn takes two seconds and swings a little beyond the turning point.
    const from = sim.time;
    let furthest = plane.x;
    runUntil(sim, () => ((furthest = Math.max(furthest, plane.x)), plane.flight.phase === 1), 5);
    expect(sim.time - from).toBeCloseTo(RULES.holding.turnTime, 1);
    expect(furthest).toBeCloseTo(RULES.holding.rightTurn + RULES.flightSpeed / RULES.holding.turnWidth, 0);
    // It comes back along the near lane, full size, and turns again at the left end.
    expect([plane.y, plane.scale, plane.facing]).toEqual([RULES.spawn.RIGHT.y, RULES.spawn.RIGHT.scale, -1]);
    runUntil(sim, () => plane.flight.phase === 2, 10);
    expect(RULES.holding.leftTurn - plane.x).toBeGreaterThanOrEqual(0);
    expect(RULES.holding.leftTurn - plane.x).toBeLessThan(RULES.flightSpeed * DT + 0.01);
    runUntil(sim, () => plane.flight.phase === 0, 5);
    expect([plane.y, plane.scale, plane.facing]).toEqual([RULES.spawn.LEFT.y, RULES.spawn.LEFT.scale, 1]);
  });

  it('lets an exhausted plane give up at a turning point, not before', () => {
    const sim = newSim();
    run(sim, 1.1);
    const plane = sim.planes[0]!;
    plane.energy = -0.1;
    run(sim, 1);
    expect(plane.state).toBe(PlaneState.FLYING);
    runUntil(sim, () => plane.state === PlaneState.LEAVING_ANGRY, 10);
    // Within a frame's travel of the turning point.
    expect(plane.x - RULES.holding.rightTurn).toBeGreaterThanOrEqual(0);
    expect(plane.x - RULES.holding.rightTurn).toBeLessThan(RULES.flightSpeed * DT + 0.01);
  });
});

describe('simulation, end of the level', () => {
  it('goes on after the time runs out while a plane still has energy', () => {
    const sim = newSim();
    const events: SimEvent[] = [];
    // Park every plane as it comes, so they are all on the ground with energy to spare.
    runUntil(
      sim,
      () => {
        for (const plane of sim.planes) if (!plane.landed && !plane.landing && plane.queue.length === 0) sim.addOrder(plane, sim.runways[plane.id % 2]!);
        return sim.timeOver;
      },
      80,
      events,
    );
    expect(sim.time).toBeCloseTo(sim.totalTime, 1);
    expect(events.filter((e) => e.type === 'timeOver')).toHaveLength(1);
    // Ten seconds on, a plane with energy left still holds the level.
    run(sim, 12, events);
    expect(sim.ended).toBe(false);
    // Exhausted planes waiting on the ground do not hold it; one still in the air does until
    // it has given up and gone.
    for (const plane of sim.planes) if (!plane.gone) plane.energy = RULES.minEnergy;
    expect(sim.planes.some((p) => !p.gone && p.landed && p.state === PlaneState.WAITING)).toBe(true);
    runUntil(sim, () => sim.ended, 60, events);
    expect(sim.planes.some((p) => !p.gone && p.landed)).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'levelEnd' });
  });

  it('waits three seconds after the time runs out on an empty airport', () => {
    const sim = newSim();
    const events = runUntil(sim, () => sim.ended, 400);
    const at = (type: string): number => events.findIndex((e) => e.type === type);
    expect(at('timeOver')).toBeGreaterThan(-1);
    expect(at('levelEnd')).toBeGreaterThan(at('timeOver'));
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

describe('simulation, improvements', () => {
  const withImprovements = (...ids: number[]): Simulation =>
    new Simulation({
      layout: ARCHES,
      schedule: findLevel(stage, 1, false),
      goals: findGoals(area, 1, false),
      planes,
      gates,
      runways,
      gasStations,
      level: 1,
      improvements: new Set(ids),
      screenWidth: 480,
    });

  it('adds gate C, upgrades gates and adds the second or VIP stop spot when owned', () => {
    expect(withImprovements().gates.map((g) => g.letter)).toEqual(['A', 'B']);
    const sim = withImprovements(0x16, 0x1e, 0x01, 0x0a);
    expect(sim.gates.map((g) => [g.letter, g.descriptor.type, g.descriptor.speed])).toEqual([
      ['A', 1, 1.5],
      ['B', 0, 1],
      ['C', 0, 1],
    ]);
    expect(sim.stopSpots.map((spot) => [spot.vip, spot.drain])).toEqual([
      [true, 0.25],
      [false, 0.5],
    ]);
    // The new places are reachable on the taxi graph.
    for (const place of [...sim.gates, ...sim.stopSpots]) expect(sim.graph.route(sim.runways[0]!.taxiNode, place.taxiNode)).not.toBeNull();
  });

  it('repaints a parked plane on the painting stop spot once it has charged', () => {
    // The painting spot takes the second place even without the plain spot having been bought.
    const sim = withImprovements(0x72);
    expect(sim.stopSpots.map((spot) => [spot.position.x, spot.painting !== null, spot.drain])).toEqual([
      [180, false, 0.5],
      [60, true, 0.5],
    ]);
    expect(sim.colors).toEqual(['BLUE', 'PINK']);
    const spot = sim.stopSpots[1]!;
    const events: SimEvent[] = [];
    run(sim, 1.1, events);
    const plane = sim.planes[0]!;
    sim.addOrder(plane, sim.runways[0]!);
    sim.addOrder(plane, spot);
    runUntil(sim, () => spot.use === 'occupied' && plane.state === PlaneState.WAITING, 40, events);
    // Still charging: nothing is offered and nothing can be painted.
    expect(spot.painting!.ready).toBe(false);
    expect(sim.paintOptions(spot)).toEqual([]);
    expect(sim.paint(spot, 'PINK')).toBe(false);

    runUntil(sim, () => spot.painting!.ready, 45, events);
    expect(sim.time).toBeCloseTo(RULES.painting.recharge, 1);
    expect(events.filter((e) => e.type === 'paintingReady')).toHaveLength(1);
    // Every colour of the level but its own.
    expect(sim.paintOptions(spot)).toEqual(['PINK']);
    expect(sim.paint(spot, 'BLUE')).toBe(false);

    plane.energy = 0.5;
    expect(sim.paint(spot, 'PINK')).toBe(true);
    expect(plane.state).toBe(PlaneState.PAINTING);
    run(sim, 3.9, events);
    expect(plane.color).toBe('BLUE');
    run(sim, 0.3, events);
    expect(plane.color).toBe('PINK');
    expect(plane.state).toBe(PlaneState.PAINTING);
    runUntil(sim, () => plane.state === PlaneState.WAITING, 3, events);
    // Being repainted costs no energy and ends with a boost; the spot has to charge again.
    expect(plane.energy).toBeCloseTo(0.9, 2);
    expect(spot.painting).toMatchObject({ ready: false, job: null });
    expect(spot.painting!.left).toBeCloseTo(RULES.painting.recharge, 1);
    expect(sim.paintOptions(spot)).toEqual([]);
    expect(events.filter((e) => e.type === 'paintingDone')).toHaveLength(1);
  });

  it('serves coffee and cake to the planes on the ground once the button has charged', () => {
    expect(withImprovements().coffee).toBeNull();
    const sim = withImprovements(0x74);
    const events: SimEvent[] = [];
    run(sim, 1.1, events);
    const landed = sim.planes[0]!;
    sim.addOrder(landed, sim.runways[0]!);
    runUntil(sim, () => landed.landed && landed.state === PlaneState.WAITING, 40, events);
    expect(sim.serveCoffee()).toBe(false);

    runUntil(sim, () => sim.coffee!.ready, 60, events);
    expect(sim.time).toBeCloseTo(RULES.coffee.recharge, 0);
    expect(events.filter((e) => e.type === 'coffeeReady')).toHaveLength(1);
    const flying = sim.planes.find((p) => !p.gone && !p.landed)!;
    landed.energy = 0.2;
    flying.energy = 0.2;
    expect(sim.serveCoffee()).toBe(true);
    // Only the plane on the ground gets it.
    expect(landed.energy).toBeCloseTo(0.7, 5);
    expect(flying.energy).toBeCloseTo(0.2, 5);
    expect(sim.coffee).toMatchObject({ ready: false, left: RULES.coffee.recharge });
    expect(sim.serveCoffee()).toBe(false);
  });

  it('skips a free stop spot when the place after it can be taken at once', () => {
    const sim = withImprovements();
    const events: SimEvent[] = [];
    run(sim, 1.1, events);
    const plane = sim.planes[0]!;
    sim.addOrder(plane, sim.runways[0]!);
    sim.addOrder(plane, sim.stopSpots[0]!);
    sim.addOrder(plane, sim.gates[0]!);
    runUntil(sim, () => plane.state === PlaneState.UNLOADING, 40, events);
    expect(events.some((e) => e.type === 'parked')).toBe(false);
    expect(sim.stopSpots[0]!.use).toBe('free');
  });

  it('parks on the stop spot while the place after it is taken', () => {
    const sim = withImprovements();
    run(sim, 23.2);
    const [first, second] = sim.planes as [Plane, Plane];
    sim.addOrder(first, sim.runways[0]!);
    sim.addOrder(first, sim.gates[0]!);
    runUntil(sim, () => first.state === PlaneState.UNLOADING, 40);
    const events: SimEvent[] = [];
    sim.addOrder(second, sim.runways[1]!);
    sim.addOrder(second, sim.stopSpots[0]!);
    sim.addOrder(second, sim.gates[0]!);
    runUntil(sim, () => events.some((e) => e.type === 'parked'), 40, events);
    expect(second.place).toBe(sim.stopSpots[0]);
  });

  it('lets planes waiting for each other swap places', () => {
    const sim = withImprovements();
    run(sim, 23.2);
    const [atGate, parked] = sim.planes as [Plane, Plane];
    const gate = sim.gates[0]!;
    const spot = sim.stopSpots[0]!;
    sim.addOrder(atGate, sim.runways[0]!);
    sim.addOrder(atGate, gate);
    sim.addOrder(parked, sim.runways[1]!);
    sim.addOrder(parked, spot);
    runUntil(sim, () => atGate.loaded && atGate.state === PlaneState.WAITING && spot.use === 'occupied' && parked.state === PlaneState.WAITING, 80);

    // The parked plane alone just waits for the gate.
    expect(sim.addOrder(parked, gate)).toBe(true);
    run(sim, 2);
    expect(parked.place).toBe(spot);
    expect(parked.state).toBe(PlaneState.WAITING);
    // Once the plane at the gate wants the stop spot, both set off together.
    expect(sim.addOrder(atGate, spot)).toBe(true);
    run(sim, 2 * DT);
    expect([atGate.state, parked.state]).toEqual([PlaneState.TAXIING, PlaneState.TAXIING]);
    runUntil(sim, () => spot.use === 'occupied' && parked.state === PlaneState.UNLOADING, 30);
    expect([atGate.place, parked.place]).toEqual([spot, gate]);
  });

  it('has every plane on the ground hold the taxi node it stands on or heads for, and no two the same', () => {
    const sim = withImprovements();
    const held = (): number[] => sim.planes.filter((p) => !p.gone && p.node).map((p) => p.node!.id);
    let moved = false;
    for (let i = 0; i < 60 * 60; i++) {
      for (const plane of sim.planes) {
        if (plane.gone || plane.queue.length > 0) continue;
        if (!plane.landed && plane.state === PlaneState.FLYING) sim.addOrder(plane, sim.runways[plane.id % sim.runways.length]!);
        else if (plane.landed && plane.state === PlaneState.WAITING && plane.need === Need.UNLOAD) sim.addOrder(plane, sim.gates[plane.id % sim.gates.length]!);
      }
      sim.update(DT);
      const nodes = held();
      expect(new Set(nodes).size).toBe(nodes.length);
      for (const plane of sim.planes) {
        if (plane.gone) continue;
        if (plane.node) expect(plane.node.occupied).toBe(true);
        if (plane.ahead) expect(plane.ahead.occupied).toBe(true);
        if (plane.state === PlaneState.TAXIING) moved = true;
      }
    }
    expect(moved).toBe(true);
    // Nothing is left held once every plane that holds a node is counted.
    const mine = new Set(sim.planes.flatMap((p) => (p.gone ? [] : [p.node, p.ahead])).filter((n) => n !== null));
    for (const node of sim.graph.nodes) expect(node.occupied).toBe(mine.has(node));
  });

  it('unloads faster at an upgraded gate', () => {
    const sim = withImprovements(0x1e);
    run(sim, 1.1);
    const plane = sim.planes[0]!;
    sim.addOrder(plane, sim.runways[0]!);
    sim.addOrder(plane, sim.gates[0]!);
    runUntil(sim, () => plane.state === PlaneState.UNLOADING, 40);
    const started = sim.time;
    runUntil(sim, () => plane.state === PlaneState.LOADING, 40);
    // LoadingTime 8 s at gate speed 1.5.
    expect(sim.time - started).toBeCloseTo(8 / 1.5, 1);
  });
});

describe('simulation, bonus events', () => {
  const withBonus = (level: number, random: () => number = () => 0.5): Simulation =>
    new Simulation({ layout: ARCHES, schedule: findLevel(stage, level, false), goals: findGoals(area, level, false), planes, gates, runways, gasStations, level, screenWidth: 480, random });

  it('has none on a level without one', () => {
    const sim = withBonus(1);
    expect(sim.bonus).toBeNull();
    run(sim, 30);
    expect([sim.balloons.length, sim.coins.length, sim.helicopter]).toEqual([0, 0, null]);
    expect(sim.tapBonus(240, 160)).toBe(false);
  });

  it('releases ten balloons from the second the stage script sets, and pays for the ones popped', () => {
    const sim = withBonus(6);
    expect(sim.bonus).toMatchObject({ kind: 'balloons', amount: 750 });
    const events: SimEvent[] = [];
    run(sim, 22, events);
    expect(sim.balloons).toHaveLength(0);
    // The first appears at 22.3 s, below the screen, and rises at 100 px a second.
    runUntil(sim, () => sim.balloons.length === 1, 1, events);
    expect(sim.time).toBeCloseTo(22.3, 1);
    const first = sim.balloons[0]!;
    expect(first.x).toBe(RULES.bonus.balloons.minX + 0.5 * RULES.bonus.balloons.spanX);
    const from = first.y;
    run(sim, 1, events);
    expect(from - first.y).toBeCloseTo(100, 0);

    // A touch within 30 px pops it and a coin appears 20 px below.
    const score = sim.score;
    const at = { x: first.x, y: first.y };
    expect(sim.tapBonus(at.x + 31, at.y)).toBe(false);
    expect(sim.tapBonus(at.x + 29, at.y - 29)).toBe(true);
    expect(sim.balloons).not.toContain(first);
    expect(sim.coins).toHaveLength(1);
    expect(sim.coins[0]).toMatchObject({ x: at.x, y: at.y + 20, amount: 750, phase: 0 });
    expect(sim.score).toBe(score);
    // The coin falls on its own and pays when it reaches y 290.
    runUntil(sim, () => events.some((e) => e.type === 'bonusPaid'), 10, events);
    expect(sim.score).toBe(score + 750);
    runUntil(sim, () => sim.coins.length === 0, 1, events);

    // Ten in all, one every second and a half with this dice, and those left alone drift off.
    let seen = 1;
    let ids = new Set(sim.balloons.map((b) => b.id));
    runUntil(
      sim,
      () => {
        for (const b of sim.balloons) if (!ids.has(b.id)) (ids.add(b.id), seen++);
        return sim.time > 22.3 + 9 * 1.5 + 5;
      },
      40,
      events,
    );
    expect(seen + (ids.has(first.id) ? 0 : 0)).toBeLessThanOrEqual(10);
    expect(ids.size + 1).toBe(10);
    expect(sim.balloons).toHaveLength(0);
    expect(events.filter((e) => e.type === 'balloonPopped')).toHaveLength(1);
  });

  it('sends a helicopter across that drops a coin and speeds up each time it is tapped', () => {
    const sim = withBonus(3);
    expect(sim.bonus).toMatchObject({ kind: 'helicopter', amount: 500, speed: 0.9, fromLeft: false });
    const events: SimEvent[] = [];
    run(sim, 69, events);
    expect(sim.helicopter).toBeNull();
    runUntil(sim, () => sim.helicopter !== null, 1, events);
    expect(sim.time).toBeCloseTo(69.2, 1);
    const helicopter = sim.helicopter!;
    // It comes in from the right at 60 px a second times its speed.
    run(sim, 1, events);
    // (give or take the frame it appeared on)
    expect(Math.abs(RULES.bonus.helicopter.rightEdge - helicopter.x - 60 * 0.9)).toBeLessThan(1.5);
    expect(Math.abs(helicopter.y - 200)).toBeLessThanOrEqual(35);

    expect(sim.tapBonus(helicopter.x + 41, helicopter.y)).toBe(false);
    expect(sim.tapBonus(helicopter.x - 39, helicopter.y + 29)).toBe(true);
    expect(helicopter).toMatchObject({ released: 1, burst: 0.4 });
    expect(helicopter.speed).toBeCloseTo(1.15, 5);
    expect(sim.coins).toHaveLength(1);
    expect(sim.tapBonus(helicopter.x, helicopter.y)).toBe(true);
    expect(helicopter.speed).toBeCloseTo(1.4, 5);

    // Both coins pay, and the helicopter leaves by the other side.
    runUntil(sim, () => sim.helicopter === null, 20, events);
    runUntil(sim, () => sim.coins.length === 0, 10, events);
    const paid = events.filter((e) => e.type === 'bonusPaid');
    expect(paid.map((e) => (e.type === 'bonusPaid' ? e.amount : 0))).toEqual([500, 500]);
    expect(events.filter((e) => e.type === 'helicopterLeft')).toHaveLength(1);
    expect(sim.tapBonus(240, 200)).toBe(false);
  });
});

describe('simulation, stage 2 (island)', () => {
  const stage2 = parseStageSchedule(tree('data/maps/stage_levels_02.json'));
  const area2 = parseLevelsDb(tree('data/descriptors/levels_db.json')).get(2)!;
  const island = (level = 1): Simulation =>
    new Simulation({
      layout: ISLAND,
      schedule: findLevel(stage2, level, false),
      goals: findGoals(area2, level, false),
      planes,
      gates,
      runways,
      gasStations,
      hangars,
      level,
      screenWidth: 480,
    });

  it('builds the island airport from its layout', () => {
    const sim = island();
    expect(sim.gates.map((g) => [g.letter, g.descriptor.type])).toEqual([
      ['A', 2],
      ['B', 2],
    ]);
    // Water runways have their node at the right end and planes leave to the left.
    expect(sim.runways.map((r) => [r.node, r.direction, r.heading])).toEqual([
      [{ x: 194, y: 195 }, -1, 180],
      [{ x: 229, y: 250 }, -1, 180],
    ]);
    expect(sim.gasStations).toHaveLength(1);
    expect(sim.gasStations[0]!.descriptor.type).toBe(2);
    expect(sim.stopSpots).toHaveLength(1);
    for (const runway of sim.runways) {
      for (const place of [...sim.gates, ...sim.gasStations, ...sim.stopSpots]) {
        expect(sim.graph.route(runway.taxiNode, place.taxiNode)).not.toBeNull();
        expect(sim.graph.route(place.taxiNode, runway.taxiNode)).not.toBeNull();
      }
    }
  });

  it('lands from the left and takes off to the left', () => {
    const sim = island();
    runUntil(sim, () => sim.planes.length > 0, 60);
    const plane = sim.planes[0]!;
    const runway = sim.runways[0]!;
    sim.addOrder(plane, runway);
    runUntil(sim, () => plane.landing, 10);
    expect(plane.x).toBeLessThan(runway.node.x);
    expect(plane.facing).toBe(1);
    runUntil(sim, () => plane.landed, 20);
    expect({ x: plane.x, y: plane.y }).toEqual(runway.node);
    expect(plane.heading).toBe(180);
  });

  it('plays a fuel plane through level 2-1', () => {
    const sim = island();
    runUntil(sim, () => sim.planes.some((p) => !p.gasDone), 200);
    const plane = sim.planes.find((p) => !p.gasDone)!;
    sim.addOrder(plane, sim.runways[0]!);
    sim.addOrder(plane, sim.gates[0]!);
    runUntil(sim, () => plane.unloaded, 80);
    sim.addOrder(plane, sim.gasStations[0]!);
    runUntil(sim, () => plane.gasDone, 80);
    sim.addOrder(plane, sim.gates[1]!);
    runUntil(sim, () => plane.state === PlaneState.LOADING, 60);
    sim.addOrder(plane, sim.runways[1]!);
    runUntil(sim, () => plane.gone, 80);
    expect(plane.loaded).toBe(true);
    expect(plane.x).toBeLessThan(0);
  });

  it('has a hangar from level 3 and services a plane before fuel and loading', () => {
    expect(island(2).hangars).toHaveLength(0);
    const sim = island(3);
    expect(sim.hangars).toHaveLength(1);
    const hangar = sim.hangars[0]!;
    expect(hangar.node).toEqual({ x: 180, y: 117 });
    const events: SimEvent[] = [];
    runUntil(sim, () => sim.planes.some((p) => !p.serviceDone), 300, events);
    const plane = sim.planes.find((p) => !p.serviceDone)!;
    const needsGas = !plane.gasDone;

    sim.addOrder(plane, sim.runways[0]!);
    // Not before unloading.
    expect(sim.addOrder(plane, hangar)).toBe(false);
    sim.addOrder(plane, sim.gates[0]!);
    runUntil(sim, () => plane.unloaded, 80, events);
    expect(plane.need).toBe(Need.SERVICE);
    // Fuel and loading are refused until servicing is done or queued.
    if (needsGas) expect(sim.addOrder(plane, sim.gasStations[0]!)).toBe(false);
    expect(sim.addOrder(plane, sim.runways[0]!)).toBe(false);

    expect(sim.addOrder(plane, hangar)).toBe(true);
    runUntil(sim, () => plane.state === PlaneState.IN_HANGAR, 40, events);
    const started = sim.time;
    runUntil(sim, () => plane.serviceDone, 60, events);
    expect(sim.time - started).toBeCloseTo(plane.descriptor.times.servicing, 1);
    // It rolls out to the exit node and is paid there.
    expect(events.some((e) => e.type === 'score' && e.reason === 'service')).toBe(false);
    runUntil(sim, () => plane.state === PlaneState.WAITING, 10, events);
    expect({ x: plane.x, y: plane.y }).toEqual({ x: 190, y: 137 });
    expect(plane.need).toBe(needsGas ? Need.GAS : Need.LOAD);
    const award = events.filter((e) => e.type === 'score' && e.reason === 'service' && e.plane === plane) as { points: number }[];
    expect(award).toHaveLength(1);
    expect(award[0]!.points).toBeLessThanOrEqual(plane.descriptor.points.hangar);
    expect(sim.addOrder(plane, hangar)).toBe(false);

    if (needsGas) {
      expect(sim.addOrder(plane, sim.gasStations[0]!)).toBe(true);
      runUntil(sim, () => plane.gasDone, 80, events);
      expect(hangar.use).toBe('free');
    }
    expect(sim.addOrder(plane, sim.gates[1]!)).toBe(true);
    runUntil(sim, () => plane.state === PlaneState.LOADING, 60, events);
    sim.addOrder(plane, sim.runways[1]!);
    runUntil(sim, () => plane.gone, 80, events);
    expect(plane.loaded).toBe(true);
  });

  it('hurries a plane with a special passenger until it has landed', () => {
    const sim = island(4);
    const events: SimEvent[] = [];
    runUntil(sim, () => sim.planes.some((p) => p.passenger !== null), 300, events);
    const plane = sim.planes.find((p) => p.passenger !== null)!;
    expect(plane.passenger).toBe('PREGNANT');
    // In the air its energy falls at twice the usual rate.
    const fall = plane.sex === 'MALE' ? plane.descriptor.times.maleEnergyFall : plane.descriptor.times.femaleEnergyFall;
    const before = plane.energy;
    for (let i = 0; i < 60; i++) sim.update(1 / 60);
    expect(before - plane.energy).toBeCloseTo(2 / fall, 2);

    sim.addOrder(plane, sim.runways[0]!);
    runUntil(sim, () => plane.landed, 60, events);
    expect(plane.passenger).toBeNull();
    expect(events.filter((e) => e.type === 'passengerDelivered')).toHaveLength(1);
    // Parked on the runway it now loses energy at the normal rate.
    const landedAt = plane.energy;
    for (let i = 0; i < 60; i++) sim.update(1 / 60);
    expect(landedAt - plane.energy).toBeCloseTo(1 / fall, 2);
  });
});

describe('simulation, stage 3 (monsters)', () => {
  const stage3 = parseStageSchedule(tree('data/maps/stage_levels_03.json'));
  const area3 = parseLevelsDb(tree('data/descriptors/levels_db.json')).get(3)!;
  /** A dice that always lands in the middle, so fog times and runways are known. */
  const steady = (level: number, ...owned: number[]): Simulation =>
    new Simulation({ layout: MONSTERS, schedule: findLevel(stage3, level, false), goals: findGoals(area3, level, false), planes, gates, runways, gasStations, hangars, level, improvements: new Set(owned), screenWidth: 480, random: () => 0.5 });

  const monsters = (level = 1, ...owned: number[]): Simulation =>
    new Simulation({
      layout: MONSTERS,
      schedule: findLevel(stage3, level, false),
      goals: findGoals(area3, level, false),
      planes,
      gates,
      runways,
      gasStations,
      hangars,
      level,
      improvements: new Set(owned),
      screenWidth: 480,
      random: FIXED_DICE,
    });

  it('builds the airport the stage script builds', () => {
    const sim = monsters();
    expect(sim.gates.map((g) => [g.letter, g.descriptor.type, g.position])).toEqual([
      ['A', 4, { x: 365, y: 145 }],
      ['B', 4, { x: 395, y: 188 }],
    ]);
    // Water-style runways: the node is at the right end.
    expect(sim.runways.map((r) => [r.number, r.node])).toEqual([
      [1, { x: 139, y: 210 }],
      [2, { x: 174, y: 250 }],
    ]);
    expect(sim.gasStations.map((g) => g.position)).toEqual([{ x: 60, y: 107 }]);
    expect(sim.hangars.map((h) => h.position)).toEqual([{ x: 170, y: 107 }]);
    expect(sim.stopSpots.map((s) => s.position)).toEqual([{ x: 270, y: 300 }]);
    for (const place of [...sim.gates, ...sim.gasStations, ...sim.hangars, ...sim.stopSpots]) expect(sim.graph.route(sim.runways[0]!.taxiNode, place.taxiNode)).not.toBeNull();
  });

  it('adds gates C and D and lays the runways out again with the third one', () => {
    const sim = monsters(1, 0x16, 0x21, 0x34);
    expect(sim.gates.map((g) => [g.letter, g.descriptor.type])).toEqual([
      ['A', 4],
      ['B', 4],
      ['C', 4],
      ['D', 5],
    ]);
    expect(sim.runways.map((r) => [r.number, r.position])).toEqual([
      [1, { x: -5, y: 195 }],
      [2, { x: 30, y: 225 }],
      [3, { x: 65, y: 255 }],
    ]);
  });

  it('shows in-flight movies to the planes still in the air once the button has charged', () => {
    expect(monsters().movies).toBeNull();
    const sim = monsters(1, 0x73);
    const events: SimEvent[] = [];
    runUntil(sim, () => sim.planes.length >= 1, 60, events);
    const landed = sim.planes[0]!;
    sim.addOrder(landed, sim.runways[0]!);
    expect(sim.showMovies()).toBe(false);
    runUntil(sim, () => sim.movies!.ready, 60, events);
    expect(sim.time).toBeCloseTo(RULES.movies.recharge, 0);
    expect(landed.landed).toBe(true);
    const flying = sim.planes.find((p) => !p.gone && !p.landed)!;
    landed.energy = 0.2;
    flying.energy = 0.2;
    expect(sim.showMovies()).toBe(true);
    // Only the one in the air gets it.
    expect(flying.energy).toBeCloseTo(0.8, 5);
    expect(landed.energy).toBeCloseTo(0.2, 5);
    expect(sim.movies).toMatchObject({ ready: false, left: RULES.movies.recharge });
    expect(events.filter((e) => e.type === 'moviesReady')).toHaveLength(1);
  });

  it('washes a dirty plane on the wash and go, which takes the second stop spot', () => {
    const sim = monsters(3, 0x01, 0x77);
    expect(sim.stopSpots.map((s) => [s.position, s.wash !== null])).toEqual([
      [{ x: 270, y: 300 }, false],
      [{ x: 169, y: 301 }, true],
    ]);
    const bay = sim.stopSpots[1]!;
    const events: SimEvent[] = [];
    runUntil(sim, () => sim.planes.some((p) => !p.gone && !p.washDone), 200, events);
    const dirty = sim.planes.find((p) => !p.gone && !p.washDone)!;
    sim.addOrder(dirty, sim.runways[0]!);
    sim.addOrder(dirty, bay);
    // A gate behind it does not make a dirty plane skip the wash.
    sim.addOrder(dirty, sim.gates[0]!);
    runUntil(sim, () => dirty.state === PlaneState.WASHING, 60, events);
    expect(dirty.place).toBe(bay);
    const started = sim.time;
    dirty.energy = 0.5;
    run(sim, 1.5, events);
    expect(dirty.washDone).toBe(false);
    run(sim, 1, events);
    // Clean with six seconds still to go, and washing costs no energy.
    expect(dirty.washDone).toBe(true);
    expect(dirty.state).toBe(PlaneState.WASHING);
    expect(dirty.energy).toBe(0.5);
    const before = sim.score;
    runUntil(sim, () => dirty.state !== PlaneState.WASHING, 10, events);
    expect(sim.time - started).toBeCloseTo(RULES.wash.time, 1);
    expect(dirty.energy).toBeGreaterThan(0.85);
    const award = events.filter((e) => e.type === 'score' && e.plane === dirty && e.reason === 'service').at(-1)!;
    expect(award).toMatchObject({ points: roundScore(0.9 * dirty.descriptor.points.washing) });
    expect(sim.score).toBe(before + (award.type === 'score' ? award.points : 0));
    expect(events.filter((e) => e.type === 'washDone')).toHaveLength(1);
  });

  it('lets a clean plane use the wash and go as somewhere to wait, and skip it', () => {
    const sim = monsters(1, 0x01, 0x77);
    const bay = sim.stopSpots[1]!;
    const events: SimEvent[] = [];
    runUntil(sim, () => sim.planes.length >= 2, 120, events);
    const [first, second] = sim.planes as [Plane, Plane];
    expect([first.washDone, second.washDone]).toEqual([true, true]);
    // With the gate free it goes straight there.
    sim.addOrder(first, sim.runways[0]!);
    sim.addOrder(first, bay);
    sim.addOrder(first, sim.gates[0]!);
    runUntil(sim, () => first.state === PlaneState.UNLOADING, 60, events);
    expect(bay.use).toBe('free');
    // Sent there alone it just parks.
    sim.addOrder(second, sim.runways[1]!);
    sim.addOrder(second, bay);
    runUntil(sim, () => bay.use === 'occupied' && second.state === PlaneState.WAITING, 60, events);
    expect(events.some((e) => e.type === 'washStarted')).toBe(false);
  });

  it('schedules as many fogs as the level has, one in each slice of its time', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((level) => monsters(level).hazardSchedule.length)).toEqual([0, 0, 1, 2, 2, 4, 2, 2]);
    // Level 4 lasts 220 s: two slices of 95 s, and this dice picks the middle of each.
    const sim = steady(4);
    expect(sim.totalTime).toBe(220);
    expect(sim.hazardSchedule).toEqual([
      { time: 47.5, runway: 1, kind: 'fog' },
      { time: 142.5, runway: 1, kind: 'fog' },
    ]);
  });

  it('closes a runway under fog for fifteen seconds', () => {
    const sim = steady(4);
    const runway = sim.runways[1]!;
    const events: SimEvent[] = [];
    run(sim, 47, events);
    expect(runway.fog).toBeNull();
    runUntil(sim, () => runway.fog !== null, 2, events);
    expect(sim.time).toBeCloseTo(47.5, 1);
    const appeared = sim.time;
    // A plane cannot be sent there, but the other runway still takes it.
    const plane = sim.planes.find((p) => !p.gone && !p.landed && p.state === PlaneState.FLYING)!;
    expect(sim.addOrder(plane, runway)).toBe(false);
    expect(sim.addOrder(plane, sim.runways[0]!)).toBe(true);
    runUntil(sim, () => runway.fog?.lifting === true, 20, events);
    expect(sim.time - appeared).toBeCloseTo(RULES.fog.time, 1);
    expect(events.filter((e) => e.type === 'hazardLifted')).toEqual([{ type: 'hazardLifted', runway, kind: 'fog', byMachine: false }]);
    // Lifting, it can be used again, and it has gone half a second later.
    const other = sim.planes.find((p) => !p.gone && !p.landed && p.state === PlaneState.FLYING && p !== plane);
    if (other) expect(sim.addOrder(other, runway)).toBe(true);
    run(sim, 0.6, events);
    expect(runway.fog).toBeNull();
  });

  it('lifts the fog seven seconds in with the anti-fog system', () => {
    const sim = steady(4, 0x6f);
    const runway = sim.runways[1]!;
    const events: SimEvent[] = [];
    runUntil(sim, () => runway.fog !== null, 60, events);
    const appeared = sim.time;
    runUntil(sim, () => runway.fog?.machine !== null && runway.fog?.machine !== undefined, 5, events);
    expect(sim.time - appeared).toBeCloseTo(RULES.hazards.machineAt, 1);
    runUntil(sim, () => runway.fog?.lifting === true, 10, events);
    expect(sim.time - appeared).toBeCloseTo(RULES.hazards.machineAt + RULES.fog.machineTime, 1);
    expect(events.filter((e) => e.type === 'hazardLifted')).toEqual([{ type: 'hazardLifted', runway, kind: 'fog', byMachine: true }]);
  });

  it('waits for a busy runway and gives up on the fog after twenty-five seconds', () => {
    const sim = steady(4);
    const runway = sim.runways[1]!;
    // A plane parked on the runway keeps it from being free.
    runUntil(sim, () => sim.planes.length >= 1, 60);
    const plane = sim.planes[0]!;
    plane.energy = 100;
    sim.addOrder(plane, runway);
    runUntil(sim, () => plane.landed, 40);
    run(sim, 47.5 + RULES.hazards.patience + 1 - sim.time);
    expect(runway.fog).toBeNull();
    expect(sim.hazardSchedule).toEqual([{ time: 142.5, runway: 1, kind: 'fog' }]);
  });

  it('has its bonus events on levels 2, 6 and 8', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((level) => monsters(level).bonus?.kind ?? null)).toEqual([null, 'balloons', null, null, null, 'helicopter', null, 'balloons']);
  });
});

describe('simulation, stage 4 (north pole)', () => {
  const stage4 = parseStageSchedule(tree('data/maps/stage_levels_04.json'));
  const area4 = parseLevelsDb(tree('data/descriptors/levels_db.json')).get(4)!;
  const pole = (level = 1, owned: number[] = [], random?: () => number): Simulation =>
    new Simulation({ layout: NORTH_POLE, schedule: findLevel(stage4, level, false), goals: findGoals(area4, level, false), planes, gates, runways, gasStations, hangars, luggages, level, improvements: new Set(owned), screenWidth: 480, random: random ?? FIXED_DICE });

  it('builds the airport the stage script builds, with its luggage conveyor', () => {
    const sim = pole();
    expect(sim.gates.map((g) => [g.letter, g.descriptor.type, g.position])).toEqual([
      ['A', 6, { x: 40, y: 105 }],
      ['B', 6, { x: 110, y: 105 }],
    ]);
    expect(sim.luggages.map((l) => [l.position, l.descriptor.type])).toEqual([[{ x: 440, y: 120 }, 1]]);
    expect(sim.gasStations.map((g) => g.position)).toEqual([{ x: 420, y: 255 }]);
    expect(sim.hangars.map((h) => h.position)).toEqual([{ x: 340, y: 85 }]);
    for (const place of [...sim.gates, ...sim.gasStations, ...sim.hangars, ...sim.luggages, ...sim.stopSpots]) expect(sim.graph.route(sim.runways[0]!.taxiNode, place.taxiNode)).not.toBeNull();
  });

  it('has three tiers of gate, the last improvement winning', () => {
    const sim = pole(1, [0x1e, 0x28, 0x1f, 0x2a, 0x17]);
    expect(sim.gates.map((g) => [g.letter, g.descriptor.type])).toEqual([
      ['A', 8],
      ['B', 7],
      ['C', 8],
      ['D', 6],
    ]);
  });

  it('loads luggage on a plane that needs it, between the services and the gate', () => {
    // A fixed dice sends the level's ice to runway 2, leaving the one used here clear.
    const sim = pole(8, [], () => 0.5);
    expect(sim.hazardSchedule.every((h) => h.runway === 1)).toBe(true);
    const conveyor = sim.luggages[0]!;
    const events: SimEvent[] = [];
    runUntil(sim, () => sim.planes.some((p) => !p.gone && !p.luggageDone && p.serviceDone && p.gasDone), 300, events);
    const plane = sim.planes.find((p) => !p.gone && !p.luggageDone && p.serviceDone && p.gasDone)!;
    plane.energy = 100;
    sim.addOrder(plane, sim.runways[0]!);
    // Not before it has unloaded.
    runUntil(sim, () => plane.landed, 60, events);
    expect(sim.addOrder(plane, conveyor)).toBe(false);
    sim.addOrder(plane, sim.gates[0]!);
    runUntil(sim, () => plane.unloaded && plane.state === PlaneState.WAITING, 80, events);
    expect(plane.need).toBe(Need.LUGGAGE);
    // The gate will not take it back until the luggage is on or queued.
    expect(sim.addOrder(plane, sim.gates[1]!)).toBe(false);
    expect(sim.addOrder(plane, conveyor)).toBe(true);
    runUntil(sim, () => plane.state === PlaneState.LUGGAGE, 60, events);
    const started = sim.time;
    plane.energy = 0.5;
    runUntil(sim, () => plane.state === PlaneState.WAITING, 60, events);
    expect(sim.time - started).toBeCloseTo(plane.descriptor.times.luggageLoading / conveyor.descriptor.speed, 1);
    expect(plane.luggageDone).toBe(true);
    expect(plane.need).toBe(Need.LOAD);
    // Loading luggage costs no energy (it is waiting again for the last frame) and pays the
    // plane's luggage points.
    expect(plane.energy).toBeCloseTo(0.5, 2);
    const award = events.filter((e) => e.type === 'score' && e.plane === plane && e.reason === 'service').at(-1)!;
    expect(award).toMatchObject({ points: roundScore(0.5 * plane.descriptor.points.luggage) });
    expect(conveyor.use).toBe('done');
  });

  it('freezes a runway for thirty seconds, or nine with the deicer', () => {
    const steady = (owned: number[]): Simulation => pole(4, owned, () => 0.5);
    const sim = steady([]);
    expect(sim.hazardSchedule.map((h) => h.kind)).toEqual(['ice', 'ice']);
    const first = sim.hazardSchedule[0]!;
    const runway = sim.runways[first.runway]!;
    const events: SimEvent[] = [];
    runUntil(sim, () => runway.ice !== null, 200, events);
    const appeared = sim.time;
    const plane = sim.planes.find((p) => !p.gone && !p.landed && p.state === PlaneState.FLYING);
    if (plane) expect(sim.addOrder(plane, runway)).toBe(false);
    runUntil(sim, () => runway.ice?.lifting === true, 40, events);
    expect(sim.time - appeared).toBeCloseTo(RULES.ice.time, 1);

    const quick = steady([0x6e]);
    const other = quick.runways[quick.hazardSchedule[0]!.runway]!;
    runUntil(quick, () => other.ice !== null, 200);
    const from = quick.time;
    runUntil(quick, () => other.ice?.lifting === true, 40);
    expect(quick.time - from).toBeCloseTo(RULES.hazards.machineAt + RULES.ice.machineTime, 1);
  });

  it('has its bonus events on levels 2, 6 and 8', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((level) => pole(level).bonus?.kind ?? null)).toEqual([null, 'helicopter', null, null, null, 'balloons', null, 'helicopter']);
  });
});

describe('simulation, stage 5 (airborne)', () => {
  const stage5 = parseStageSchedule(tree('data/maps/stage_levels_05.json'));
  const area5 = parseLevelsDb(tree('data/descriptors/levels_db.json')).get(5)!;
  const airborne = (level = 1, owned: number[] = []): Simulation =>
    new Simulation({ layout: AIRBORNE, schedule: findLevel(stage5, level, false), goals: findGoals(area5, level, false), planes, gates, runways, gasStations, hangars, luggages, level, improvements: new Set(owned), screenWidth: 480, random: FIXED_DICE });

  it('builds the airport the stage script builds', () => {
    const sim = airborne();
    expect(sim.gates.map((g) => [g.letter, g.descriptor.type, g.position])).toEqual([
      ['A', 9, { x: 345, y: 147 }],
      ['B', 9, { x: 375, y: 192 }],
    ]);
    expect(sim.runways.map((r) => [r.number, r.descriptor.type, r.position])).toEqual([
      [1, 3, { x: -5, y: 200 }],
      [2, 3, { x: 35, y: 240 }],
    ]);
    expect([sim.gasStations[0]!.position, sim.hangars[0]!.position, sim.luggages[0]!.position]).toEqual([
      { x: 137, y: 115 },
      { x: 48, y: 115 },
      { x: 240, y: 115 },
    ]);
    expect(sim.hangars[0]!.descriptor.type).toBe(3);
    for (const place of [...sim.gates, ...sim.gasStations, ...sim.hangars, ...sim.luggages, ...sim.stopSpots]) expect(sim.graph.route(sim.runways[0]!.taxiNode, place.taxiNode)).not.toBeNull();
  });

  it('makes runway 1 the VIP runway and swaps in the improved hangar when owned', () => {
    const sim = airborne(1, [0x3c, 0x50, 0x34]);
    // The VIP runway keeps a combo going twice as long.
    expect(sim.runways.map((r) => [r.number, r.descriptor.type, r.descriptor.comboTime])).toEqual([
      [1, 7, 10],
      [2, 3, 5],
      [3, 3, 5],
    ]);
    expect(sim.hangars[0]!.descriptor.type).toBe(8);
  });

  it('has fog from level 3 and its bonus events on levels 2, 6 and 8', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((level) => airborne(level).hazardSchedule.filter((h) => h.kind === 'fog').length)).toEqual([0, 0, 1, 2, 2, 4, 2, 2]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((level) => airborne(level).bonus?.kind ?? null)).toEqual([null, 'balloons', null, null, null, 'helicopter', null, 'balloons']);
  });
});

describe('simulation, stage 6 (africa)', () => {
  const stage6 = parseStageSchedule(tree('data/maps/stage_levels_06.json'));
  const area6 = parseLevelsDb(tree('data/descriptors/levels_db.json')).get(6)!;
  const africa = (level = 1, owned: number[] = [], random?: () => number): Simulation =>
    new Simulation({ layout: AFRICA, schedule: findLevel(stage6, level, false), goals: findGoals(area6, level, false), planes, gates, runways, gasStations, hangars, luggages, level, improvements: new Set(owned), screenWidth: 480, random: random ?? FIXED_DICE });

  it('builds the airport the stage script builds, with three runways and a fourth on sale', () => {
    const sim = africa();
    expect(sim.gates.map((g) => [g.letter, g.descriptor.type, g.position])).toEqual([
      ['A', 12, { x: 350, y: 125 }],
      ['B', 12, { x: 375, y: 175 }],
    ]);
    expect(sim.runways.map((r) => [r.number, r.descriptor.type, r.position])).toEqual([
      [1, 4, { x: -5, y: 175 }],
      [2, 4, { x: 20, y: 210 }],
      [3, 4, { x: 45, y: 245 }],
    ]);
    expect([sim.gasStations[0]!.position, sim.hangars[0]!.position, sim.luggages[0]!.position]).toEqual([
      { x: 245, y: 78 },
      { x: 135, y: 68 },
      { x: 21, y: 98 },
    ]);
    expect([sim.gasStations[0]!.descriptor.type, sim.hangars[0]!.descriptor.type, sim.luggages[0]!.descriptor.type]).toEqual([6, 4, 3]);
    for (const place of [...sim.gates, ...sim.gasStations, ...sim.hangars, ...sim.luggages, ...sim.stopSpots]) expect(sim.graph.route(sim.runways[0]!.taxiNode, place.taxiNode)).not.toBeNull();

    const full = africa(1, [0x35, 0x3c, 0x50, 0x16, 0x2b]);
    expect(full.runways.map((r) => [r.number, r.descriptor.type, r.position])).toEqual([
      [1, 7, { x: 0, y: 170 }],
      [2, 4, { x: 25, y: 200 }],
      [3, 4, { x: 50, y: 230 }],
      [4, 4, { x: 75, y: 260 }],
    ]);
    expect(full.hangars[0]!.descriptor.type).toBe(9);
    expect(full.gates.map((g) => [g.letter, g.descriptor.type])).toEqual([
      ['A', 12],
      ['B', 12],
      ['C', 12],
      ['D', 14],
    ]);
  });

  /** A dice that goes round four throws: the level's fog lands on runway 1 and its sand, earlier, on runway 3. */
  const dice = (): (() => number) => {
    const throws = [0.1, 0.5, 0.9, 0.3];
    let next = 0;
    return () => throws[next++ % throws.length]!;
  };

  // Nine levels, from the levels database.
  const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const FOGS = [0, 0, 1, 3, 3, 3, 4, 3, 5];
  const SANDS = [0, 0, 1, 2, 3, 3, 6, 3, 3];

  it('schedules the fog and the sand the levels database gives each level', () => {
    // A level can end up with fewer than its number when no free moment is found on a runway.
    const count = (kind: string) => LEVELS.map((level) => findGoals(area6, level, false)[kind === 'fog' ? 'fogs' : 'sands']);
    expect(area6.levelsCount).toBe(9);
    expect(count('fog')).toEqual(FOGS);
    expect(count('sand')).toEqual(SANDS);
    // Scheduled fog first and sand second, then put in order of time.
    expect(africa(3, [], dice()).hazardSchedule.map((h) => [h.kind, h.runway])).toEqual([
      ['sand', 2],
      ['fog', 0],
    ]);
    // With the same throw for both, the sand finds the fog's moment on its runway taken twenty times over and is dropped.
    expect(africa(3, [], () => 0.5).hazardSchedule.map((h) => h.kind)).toEqual(['fog']);
    expect(LEVELS.map((level) => africa(level).bonus?.kind ?? null)).toEqual([null, 'helicopter', null, null, 'balloons', null, 'helicopter', null, 'balloons']);
  });

  it('closes a runway under sand for eighteen seconds, or five and a half with the anti-sand', () => {
    const level = SANDS.findIndex((sands) => sands > 0) + 1;
    const first = (sim: Simulation) => sim.runways[sim.hazardSchedule.find((h) => h.kind === 'sand')!.runway]!;
    const sim = africa(level, [], dice());
    const runway = first(sim);
    const events: SimEvent[] = [];
    runUntil(sim, () => runway.sand !== null, 400, events);
    const appeared = sim.time;
    const plane = sim.planes.find((p) => !p.gone && !p.landed && p.state === PlaneState.FLYING);
    if (plane) expect(sim.addOrder(plane, runway)).toBe(false);
    runUntil(sim, () => runway.sand?.lifting === true, 40, events);
    expect(sim.time - appeared).toBeCloseTo(RULES.sand.machineAt + RULES.sand.time + RULES.sand.settle, 1);
    expect(events.some((e) => e.type === 'hazardMachine')).toBe(false);
    // It then fades away in a second.
    runUntil(sim, () => runway.sand === null, 5);
    expect(sim.time - appeared).toBeCloseTo(19, 1);

    const quick = africa(level, [0x70], dice());
    const other = first(quick);
    const swept: SimEvent[] = [];
    runUntil(quick, () => other.sand !== null, 400, swept);
    const from = quick.time;
    runUntil(quick, () => other.sand?.lifting === true, 40, swept);
    expect(quick.time - from).toBeCloseTo(RULES.sand.machineAt + (1 - RULES.sand.clearAt) / RULES.sand.sweep, 1);
    expect(swept.filter((e) => e.type === 'hazardMachine' && e.kind === 'sand')).toHaveLength(1);
  });
});

describe('simulation, stage 7 (antarctic)', () => {
  const stage7 = parseStageSchedule(tree('data/maps/stage_levels_07.json'));
  const area7 = parseLevelsDb(tree('data/descriptors/levels_db.json')).get(7)!;
  const antarctic = (level = 1, owned: number[] = [], random?: () => number): Simulation =>
    new Simulation({ layout: ANTARCTIC, schedule: findLevel(stage7, level, false), goals: findGoals(area7, level, false), planes, gates, runways, gasStations, hangars, luggages, level, improvements: new Set(owned), screenWidth: 480, random: random ?? FIXED_DICE });
  const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('builds the airport the stage script builds', () => {
    const sim = antarctic();
    expect(area7.levelsCount).toBe(10);
    expect(sim.gates.map((g) => [g.letter, g.descriptor.type, g.position])).toEqual([
      ['A', 15, { x: 345, y: 145 }],
      ['B', 15, { x: 377, y: 190 }],
    ]);
    expect(sim.runways.map((r) => [r.number, r.descriptor.type, r.position])).toEqual([
      [1, 4, { x: -5, y: 180 }],
      [2, 4, { x: 20, y: 210 }],
      [3, 4, { x: 45, y: 240 }],
    ]);
    expect([sim.gasStations[0]!.position, sim.hangars[0]!.position, sim.luggages[0]!.position]).toEqual([
      { x: 48, y: 92 },
      { x: 163, y: 85 },
      { x: 340, y: 87 },
    ]);
    expect([sim.gasStations[0]!.descriptor.type, sim.hangars[0]!.descriptor.type, sim.luggages[0]!.descriptor.type]).toEqual([7, 5, 4]);
    for (const place of [...sim.gates, ...sim.gasStations, ...sim.hangars, ...sim.luggages, ...sim.stopSpots]) expect(sim.graph.route(sim.runways[0]!.taxiNode, place.taxiNode)).not.toBeNull();

    const full = antarctic(1, [0x35, 0x3c, 0x50, 0x17, 0x2a]);
    expect(full.runways.map((r) => [r.number, r.descriptor.type])).toEqual([
      [1, 7],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
    expect(full.hangars[0]!.descriptor.type).toBe(10);
    expect(full.gates.map((g) => [g.letter, g.descriptor.type])).toEqual([
      ['A', 15],
      ['B', 15],
      ['C', 17],
      ['D', 15],
    ]);
    for (const place of [...full.gates, ...full.gasStations, ...full.hangars, ...full.luggages, ...full.stopSpots]) expect(full.graph.route(full.runways[3]!.taxiNode, place.taxiNode)).not.toBeNull();
  });

  it('has a barrier by the building that no taxi link crosses', () => {
    const { nodes } = antarctic().graph;
    const [from, to] = [nodes.find((n) => n.x === 310 && n.y === 160)!, nodes.find((n) => n.x === 330 && n.y === 190)!];
    expect([from.terminal, to.terminal, from.links, to.links]).toEqual([true, true, [to], [from]]);
    // Whether two segments cross, by the side each end falls on.
    const side = (a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const crossing = nodes.flatMap((a) => a.links.filter((b) => a.id < b.id && a !== from && b !== to && side(a, b, from) * side(a, b, to) < 0 && side(from, to, a) * side(from, to, b) < 0));
    expect(crossing).toEqual([]);
  });

  it('gets its fog and ice from the levels database and its bonus events from the script', () => {
    expect(LEVELS.map((level) => [findGoals(area7, level, false).fogs, findGoals(area7, level, false).ices])).toEqual([
      [0, 0],
      [0, 0],
      [0, 2],
      [1, 1],
      [1, 3],
      [5, 4],
      [2, 3],
      [4, 4],
      [3, 5],
      [3, 8],
    ]);
    // In order of time whatever the kind.
    // A dice that varies, so that fog and ice do not all ask for the same runway and moment.
    let seed = 7;
    const varied = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const schedule = antarctic(6, [], varied).hazardSchedule;
    const times = schedule.map((h) => h.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(schedule.map((h) => h.kind))).toEqual(new Set(['fog', 'ice']));
    expect(LEVELS.map((level) => antarctic(level).bonus?.kind ?? null)).toEqual([null, 'helicopter', null, 'balloons', null, 'helicopter', null, null, 'balloons', null]);
  });
});

describe('simulation, stage 8 (carrier)', () => {
  const stage8 = parseStageSchedule(tree('data/maps/stage_levels_08.json'));
  const area8 = parseLevelsDb(tree('data/descriptors/levels_db.json')).get(8)!;
  const carrier = (level = 1, owned: number[] = []): Simulation =>
    new Simulation({ layout: CARRIER, schedule: findLevel(stage8, level, false), goals: findGoals(area8, level, false), planes, gates, runways, gasStations, hangars, luggages, level, improvements: new Set(owned), screenWidth: 480, random: FIXED_DICE });
  const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  it('builds the airport the stage script builds', () => {
    const sim = carrier();
    expect(area8.levelsCount).toBe(11);
    expect(sim.gates.map((g) => [g.letter, g.descriptor.type, g.position])).toEqual([
      ['A', 18, { x: 348, y: 136 }],
      ['B', 18, { x: 380, y: 182 }],
    ]);
    expect(sim.runways.map((r) => [r.number, r.descriptor.type, r.position])).toEqual([
      [1, 5, { x: -5, y: 180 }],
      [2, 5, { x: 20, y: 210 }],
      [3, 5, { x: 45, y: 240 }],
    ]);
    expect([sim.gasStations[0]!.position, sim.hangars[0]!.position, sim.luggages[0]!.position]).toEqual([
      { x: 55, y: 97 },
      { x: 170, y: 75 },
      { x: 340, y: 86 },
    ]);
    expect([sim.gasStations[0]!.descriptor.type, sim.hangars[0]!.descriptor.type, sim.luggages[0]!.descriptor.type]).toEqual([8, 6, 5]);
    for (const place of [...sim.gates, ...sim.gasStations, ...sim.hangars, ...sim.luggages, ...sim.stopSpots]) expect(sim.graph.route(sim.runways[0]!.taxiNode, place.taxiNode)).not.toBeNull();
  });

  it('swaps in the improved gas station and hangar, the VIP runway and the fourth runway', () => {
    const full = carrier(1, [0x35, 0x3c, 0x50, 0x5a, 0x16, 0x21]);
    expect([full.gasStations[0]!.descriptor.type, full.hangars[0]!.descriptor.type]).toEqual([10, 11]);
    expect(full.runways.map((r) => [r.number, r.descriptor.type, r.position])).toEqual([
      [1, 7, { x: 0, y: 170 }],
      [2, 5, { x: 25, y: 200 }],
      [3, 5, { x: 50, y: 230 }],
      [4, 5, { x: 75, y: 260 }],
    ]);
    expect(full.gates.map((g) => [g.letter, g.descriptor.type])).toEqual([
      ['A', 18],
      ['B', 18],
      ['C', 18],
      ['D', 19],
    ]);
    // The improved pump fills a plane faster than the plain one.
    expect(full.gasStations[0]!.descriptor.speed).toBeGreaterThan(carrier().gasStations[0]!.descriptor.speed);
    for (const place of [...full.gates, ...full.gasStations, ...full.hangars, ...full.luggages, ...full.stopSpots]) expect(full.graph.route(full.runways[3]!.taxiNode, place.taxiNode)).not.toBeNull();
  });

  it('gets its fog and ice from the levels database and its bonus events from the script', () => {
    expect(LEVELS.map((level) => [findGoals(area8, level, false).fogs, findGoals(area8, level, false).ices])).toEqual([
      [0, 0],
      [0, 0],
      [0, 2],
      [1, 2],
      [1, 2],
      [6, 5],
      [3, 5],
      [6, 2],
      [1, 5],
      [6, 5],
      [5, 7],
    ]);
    expect(LEVELS.map((level) => carrier(level).bonus?.kind ?? null)).toEqual([null, 'helicopter', null, null, null, 'balloons', null, 'helicopter', null, null, 'balloons']);
  });
});

describe('simulation, stage 9 (moon)', () => {
  const stage9 = parseStageSchedule(tree('data/maps/stage_levels_09.json'));
  const area9 = parseLevelsDb(tree('data/descriptors/levels_db.json')).get(9)!;
  const moon = (level = 1, owned: number[] = [], random?: () => number): Simulation =>
    new Simulation({ layout: MOON, schedule: findLevel(stage9, level, false), goals: findGoals(area9, level, false), planes, gates, runways, gasStations, hangars, luggages, level, improvements: new Set(owned), screenWidth: 480, random: random ?? FIXED_DICE });
  const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it('builds the airport the stage script builds', () => {
    const sim = moon();
    expect(area9.levelsCount).toBe(12);
    expect(sim.gates.map((g) => [g.letter, g.descriptor.type, g.position])).toEqual([
      ['A', 21, { x: 345, y: 150 }],
      ['B', 21, { x: 380, y: 190 }],
    ]);
    expect(sim.runways.map((r) => [r.number, r.descriptor.type, r.position])).toEqual([
      [1, 6, { x: -5, y: 195 }],
      [2, 6, { x: 20, y: 230 }],
      [3, 6, { x: 45, y: 265 }],
    ]);
    expect([sim.gasStations[0]!.position, sim.hangars[0]!.position, sim.luggages[0]!.position]).toEqual([
      { x: 35, y: 110 },
      { x: 120, y: 95 },
      { x: 343, y: 90 },
    ]);
    expect([sim.gasStations[0]!.descriptor.type, sim.hangars[0]!.descriptor.type, sim.luggages[0]!.descriptor.type]).toEqual([9, 7, 6]);
    for (const place of [...sim.gates, ...sim.gasStations, ...sim.hangars, ...sim.luggages, ...sim.stopSpots]) expect(sim.graph.route(sim.runways[0]!.taxiNode, place.taxiNode)).not.toBeNull();

    const full = moon(1, [0x35, 0x3c, 0x50, 0x5a, 0x64, 0x16, 0x17]);
    expect([full.gasStations[0]!.descriptor.type, full.hangars[0]!.descriptor.type, full.luggages[0]!.descriptor.type]).toEqual([11, 12, 7]);
    expect(full.runways.map((r) => [r.number, r.descriptor.type, r.position])).toEqual([
      [1, 7, { x: 0, y: 180 }],
      [2, 6, { x: 25, y: 210 }],
      [3, 6, { x: 50, y: 240 }],
      [4, 6, { x: 75, y: 270 }],
    ]);
    // The improved conveyor loads luggage faster.
    expect(full.luggages[0]!.descriptor.speed).toBeGreaterThan(sim.luggages[0]!.descriptor.speed);
    for (const place of [...full.gates, ...full.gasStations, ...full.hangars, ...full.luggages, ...full.stopSpots]) expect(full.graph.route(full.runways[3]!.taxiNode, place.taxiNode)).not.toBeNull();
  });

  it('clears its fog, which is space gas, with the anti space gas and not the anti-fog', () => {
    expect([moon(1, [0x6f]).machines.fog, moon(1, [0x71]).machines.fog]).toEqual([false, true]);
    // Elsewhere it is the other way round.
    const stage6 = parseStageSchedule(tree('data/maps/stage_levels_06.json'));
    const area6 = parseLevelsDb(tree('data/descriptors/levels_db.json')).get(6)!;
    const africa = (owned: number[]) => new Simulation({ layout: AFRICA, schedule: findLevel(stage6, 1, false), goals: findGoals(area6, 1, false), planes, gates, runways, gasStations, hangars, luggages, level: 1, improvements: new Set(owned), screenWidth: 480 });
    expect([africa([0x6f]).machines.fog, africa([0x71]).machines.fog]).toEqual([true, false]);
  });

  it('has fog, ice and sand together, and no bonus events', () => {
    expect(LEVELS.map((level) => { const g = findGoals(area9, level, false); return [g.fogs, g.ices, g.sands]; })).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [1, 0, 1],
      [3, 3, 3],
      [3, 4, 4],
      [5, 6, 6],
      [3, 4, 5],
      [4, 5, 4],
      [8, 6, 5],
      [6, 4, 9],
      [5, 8, 5],
      [8, 5, 8],
    ]);
    let seed = 11;
    const varied = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    expect(new Set(moon(6, [], varied).hazardSchedule.map((h) => h.kind))).toEqual(new Set(['fog', 'ice', 'sand']));
    expect(LEVELS.map((level) => moon(level).bonus?.kind ?? null)).toEqual(LEVELS.map(() => null));
  });
});

describe('simulation, stage 10 (mars)', () => {
  const stage10 = parseStageSchedule(tree('data/maps/stage_levels_10.json'));
  const area10 = parseLevelsDb(tree('data/descriptors/levels_db.json')).get(10)!;
  const mars = (level = 1, owned: number[] = []): Simulation =>
    new Simulation({ layout: MARS, schedule: findLevel(stage10, level, false), goals: findGoals(area10, level, false), planes, gates, runways, gasStations, hangars, luggages, level, improvements: new Set(owned), screenWidth: 480, random: FIXED_DICE });
  const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

  it('builds the airport the stage script builds', () => {
    const sim = mars();
    expect(area10.levelsCount).toBe(13);
    expect(sim.gates.map((g) => [g.letter, g.descriptor.type, g.position])).toEqual([
      ['A', 25, { x: 333, y: 125 }],
      ['B', 25, { x: 370, y: 170 }],
    ]);
    expect(sim.runways.map((r) => [r.number, r.descriptor.type, r.position])).toEqual([
      [1, 6, { x: 20, y: 185 }],
      [2, 6, { x: 45, y: 220 }],
      [3, 6, { x: 70, y: 255 }],
    ]);
    expect([sim.gasStations[0]!.position, sim.hangars[0]!.position, sim.luggages[0]!.position]).toEqual([
      { x: 143, y: 97 },
      { x: 238, y: 80 },
      { x: 50, y: 93 },
    ]);
    expect([sim.gasStations[0]!.descriptor.type, sim.hangars[0]!.descriptor.type, sim.luggages[0]!.descriptor.type]).toEqual([13, 14, 8]);
    for (const place of [...sim.gates, ...sim.gasStations, ...sim.hangars, ...sim.luggages, ...sim.stopSpots]) expect(sim.graph.route(sim.runways[0]!.taxiNode, place.taxiNode)).not.toBeNull();

    const full = mars(1, [0x35, 0x3c, 0x50, 0x5a, 0x64, 0x16, 0x17, 0x28]);
    expect([full.gasStations[0]!.descriptor.type, full.hangars[0]!.descriptor.type, full.luggages[0]!.descriptor.type]).toEqual([14, 15, 9]);
    // Its VIP runway is of type 9, not the 7 of the stages before.
    expect(full.runways.map((r) => [r.number, r.descriptor.type, r.position])).toEqual([
      [1, 9, { x: 15, y: 175 }],
      [2, 6, { x: 35, y: 205 }],
      [3, 6, { x: 55, y: 235 }],
      [4, 6, { x: 75, y: 265 }],
    ]);
    expect(full.gates.map((g) => [g.letter, g.descriptor.type, g.position])).toEqual([
      ['A', 27, { x: 333, y: 125 }],
      ['B', 25, { x: 370, y: 170 }],
      ['C', 25, { x: 407, y: 215 }],
      ['D', 25, { x: 444, y: 260 }],
    ]);
    for (const place of [...full.gates, ...full.gasStations, ...full.hangars, ...full.luggages, ...full.stopSpots]) expect(full.graph.route(full.runways[3]!.taxiNode, place.taxiNode)).not.toBeNull();
  });

  it('has space gas, ice and sand, and no bonus events', () => {
    expect(mars(1, [0x71]).machines).toEqual({ fog: true, ice: false, sand: false });
    expect(LEVELS.map((level) => { const g = findGoals(area10, level, false); return [g.fogs, g.ices, g.sands]; })).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [1, 0, 1],
      [3, 2, 1],
      [2, 3, 2],
      [8, 2, 2],
      [3, 5, 4],
      [3, 4, 7],
      [8, 5, 5],
      [6, 9, 5],
      [7, 3, 7],
      [9, 9, 9],
      [3, 3, 11],
    ]);
    expect(LEVELS.map((level) => mars(level).bonus?.kind ?? null)).toEqual(LEVELS.map(() => null));
  });
});

describe('hints for refused orders', () => {
  const stage4 = parseStageSchedule(tree('data/maps/stage_levels_04.json'));
  const area4 = parseLevelsDb(tree('data/descriptors/levels_db.json')).get(4)!;
  const pole = (level: number): Simulation =>
    new Simulation({ layout: NORTH_POLE, schedule: findLevel(stage4, level, false), goals: findGoals(area4, level, false), planes, gates, runways, gasStations, hangars, luggages, level, screenWidth: 480, random: FIXED_DICE });
  const hintsOf = (sim: Simulation): number[] => sim.drainEvents().flatMap((e) => (e.type === 'hint' ? [e.id] : []));

  it('names the picture and the text of each, with the stage in the picture', () => {
    expect(hintFor(Hint.UNLOAD, 4)).toEqual({ image: 'HINTS.GATE_4', text: 'HINTS.NEED_TO_BE_UNLOADED' });
    expect(hintFor(Hint.FOG, 3)).toEqual({ image: 'HINTS.FOG', text: 'HINTS.FOG' });
    expect(hintImages(7)).toContain('HINTS.LUGGAGE_7');
  });

  it('tells a selected plane what it still has to do, in the order the place asks', () => {
    const sim = pole(1);
    runUntil(sim, () => sim.planes.some((p) => p.state === PlaneState.FLYING));
    const plane = sim.planes.find((p) => p.state === PlaneState.FLYING)!;
    sim.drainEvents();
    // Not the selected plane: the order is refused in silence.
    expect(sim.addOrder(plane, sim.gasStations[0]!)).toBe(false);
    expect(hintsOf(sim)).toEqual([]);
    sim.select(plane);
    // In the air everything asks for it to land first.
    expect(sim.addOrder(plane, sim.gasStations[0]!)).toBe(false);
    expect(hintsOf(sim)).toEqual([Hint.LAND]);
    sim.addOrder(plane, sim.runways[0]!);
    runUntil(sim, () => plane.landed && plane.state === PlaneState.WAITING);
    sim.drainEvents();
    // Down but not unloaded: the pump, the hangar and the conveyor ask for that; a runway too.
    expect(sim.addOrder(plane, sim.hangars[0]!)).toBe(false);
    expect(sim.addOrder(plane, sim.runways[0]!)).toBe(false);
    expect(hintsOf(sim)).toEqual([Hint.UNLOAD]);
  });

  it('keeps quiet for the next three occasions of a hint just shown', () => {
    const sim = pole(1);
    runUntil(sim, () => sim.planes.some((p) => p.state === PlaneState.FLYING));
    const plane = sim.planes.find((p) => p.state === PlaneState.FLYING)!;
    sim.select(plane);
    sim.drainEvents();
    const tries = [1, 2, 3, 4, 5, 6].map(() => {
      sim.addOrder(plane, sim.luggages[0]!);
      return hintsOf(sim).length;
    });
    expect(tries).toEqual([1, 0, 0, 0, 1, 0]);
  });

  it('says what lies on a runway that is closed', () => {
    const sim = pole(4);
    const runway = sim.runways[sim.hazardSchedule[0]!.runway]!;
    runUntil(sim, () => runway.ice !== null, 300);
    const plane = sim.planes.find((p) => !p.gone && p.state === PlaneState.FLYING);
    if (!plane) return;
    sim.select(plane);
    sim.drainEvents();
    expect(sim.addOrder(plane, runway)).toBe(false);
    expect(hintsOf(sim)).toEqual([Hint.ICE]);
  });
});

describe('stage layouts', () => {
  it('give stop spots the balloon corner each stage script passes', () => {
    expect([...STAGES.values()].map((layout) => [layout.stage, layout.stopSpotBalloonCorner ?? 0])).toEqual([
      [1, 0],
      [2, 0],
      [3, 1],
      [4, 0],
      [5, 1],
      [6, 1],
      [7, 1],
      [8, 0],
      [9, 1],
      [10, 1],
    ]);
  });
});

