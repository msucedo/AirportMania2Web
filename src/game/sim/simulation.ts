import type { GasStationDescriptor, GateDescriptor, HangarDescriptor, RunwayDescriptor } from '../../data/airport';
import type { LevelGoals, LevelSchedule, PlaneColor, PlaneSpawn, Sex } from '../../data/levels';
import type { PlaneDescriptor } from '../../data/planes';
import type { Point } from '../../data/xml';
import { COLOR_NAMES } from '../palette';
import { IMPROVEMENT, type BonusEvent, type StageLayout } from '../stages/layout';
import { TaxiGraph, type TaxiNode } from './taxiGraph';
import { Need, PlaneState, RULES, UNSELECTABLE_STATES, clamp01, punctuality, roundScore, type Punctuality } from './rules';

// Deterministic, render-free model of one level. Coordinates are screen pixels.

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface PlaceBase {
  id: string;
  /** Where a plane stands when it uses the place. */
  node: Point;
  /** The same position as a node of the taxi graph. */
  taxiNode: TaxiNode;
  click: Rect;
  /** Plane using or heading to the place. */
  plane: Plane | null;
}

export interface Gate extends PlaceBase {
  kind: 'gate';
  letter: string;
  position: Point;
  descriptor: GateDescriptor;
  /** Colour of the last plane served and how many in a row shared it. */
  lastColor: PlaneColor | null;
  combo: number;
  /** Original `gate+0xc8`: 0 idle, 1 reserved, 2 unloading, 3 loading, 5 unloaded, 4 loaded. */
  service: 'idle' | 'reserved' | 'unloading' | 'loading' | 'unloaded' | 'loaded';
  /** Set when the plane reserving the gate is the one it already holds; such a visit does not build the colour combo. */
  samePlane: boolean;
  /** Seconds of plane loading time already worked off. */
  progress: number;
}

interface ComboTrack {
  count: number;
  /** 0..1; a combo continues while it is above 0. */
  value: number;
  /** Charging towards 1; once there it switches off and the value decays. */
  active: boolean;
}

export interface Runway extends PlaceBase {
  kind: 'runway';
  number: number;
  position: Point;
  descriptor: RunwayDescriptor;
  /** Direction of the take-off run (+1 right, -1 left). Landings roll the opposite way. */
  direction: 1 | -1;
  /** Heading a plane takes when it stops on the runway node (`place+0x34`). */
  heading: number;
  /** Original `runway+0x84`: 0 free, 4 landing reserved, 1 take-off reserved, 2 taking off. */
  use: 'free' | 'landing' | 'takeOffReserved' | 'takingOff';
  landings: ComboTrack;
  takeOffs: ComboTrack;
}

export interface GasStation extends PlaceBase {
  kind: 'gasStation';
  position: Point;
  descriptor: GasStationDescriptor;
  /** Original `station+0x74`: 0 free, 1 reserved, 2 fueling, 3 done and waiting for the plane to leave. */
  use: 'free' | 'reserved' | 'fueling' | 'done';
  /** Seconds of the plane's fueling time already worked off. */
  progress: number;
}

export interface Hangar extends PlaceBase {
  kind: 'hangar';
  position: Point;
  descriptor: HangarDescriptor;
  /** Original `hangar+0x78`: 0 free, 1 reserved, 2 working, 3 plane rolling out, 4 paid and waiting to leave. */
  use: 'free' | 'reserved' | 'working' | 'leaving' | 'done';
  /** Where a serviced plane waits (`hangar+0x88`). */
  exitTaxiNode: TaxiNode;
  /** Seconds of the plane's servicing time already worked off. */
  progress: number;
}

export interface StopSpot extends PlaceBase {
  kind: 'stopSpot';
  position: Point;
  vip: boolean;
  /** Energy drain multiplier for a plane parked here (`spot+0x6c`). */
  drain: number;
  /** Original `spot+0x60`: 0 free, 1 reserved, 2 occupied. */
  use: 'free' | 'reserved' | 'occupied';
  /** The repainting equipment of a painting stop spot; null on an ordinary one. */
  painting: PaintBooth | null;
}

/** A balloon of the balloons bonus, rising until popped or gone (class `0x222f8`). */
export interface Balloon {
  id: number;
  x: number;
  y: number;
  /** Which of the three balloon images it uses. */
  image: number;
}

/** A coin released by a bonus: it grows, falls and pays (class `0x26224`). */
export interface Coin {
  id: number;
  x: number;
  y: number;
  amount: number;
  /** 0 growing, 1 falling, 2 shrinking after paying. */
  phase: 0 | 1 | 2;
  scale: number;
  /** Seconds it has existed, for its swing. */
  time: number;
}

/** The helicopter of the helicopter bonus while it crosses (class `0x4996c`). */
export interface Helicopter {
  x: number;
  y: number;
  /** How far along its crossing it is; also runs its rotor animation (`+0x5c`). */
  progress: number;
  speed: number;
  /** The burst a tap gives it, fading (`+0x64`). */
  burst: number;
  fromLeft: boolean;
  /** Random phases of its bobbing (`+0x70`, `+0x74`). */
  phases: [number, number];
  /** Coins it has released. */
  released: number;
}

/** A service the player starts from the top bar, usable again after a recharge (class `0x24010`). */
export interface ServiceButton {
  recharge: number;
  /** Seconds of recharge left (`+0x24`); it is ready once this has gone below zero. */
  left: number;
  ready: boolean;
}

/** What a painting stop spot adds to a stop spot (class at vtable `0x17b1e8`). */
export interface PaintBooth {
  /** Seconds it takes to recharge after a repaint (`+0x74`). */
  recharge: number;
  /** Seconds of recharge left (`+0x78`). */
  left: number;
  /** Recharged and able to paint (`+0x80`). */
  ready: boolean;
  /** The repaint under way: the new colour and the seconds since it began (object `0x7796c`). */
  job: { color: PlaneColor; time: number; applied: boolean } | null;
}

export type Place = Gate | Runway | GasStation | Hangar | StopSpot;

export interface Plane {
  id: number;
  descriptor: PlaneDescriptor;
  color: PlaneColor;
  sex: Sex;
  /**
   * A special passenger aboard (`plane+0x228`), or null. While there is one the energy falls
   * twice as fast (0x8920). A transplant organ or a pregnant passenger is delivered as soon as
   * the plane has landed (0x8378); the president stays until it leaves.
   */
  passenger: 'PRESIDENT' | 'PREGNANT' | 'ORGAN' | null;
  state: PlaneState;
  energy: number;
  /** Ground position; draw at `y - altitude`. */
  x: number;
  y: number;
  altitude: number;
  /** Horizontal travel direction, for the view. */
  facing: 1 | -1;
  /**
   * Where the plane is in the holding pattern (`plane+0x330` in state 0): 0 flying right on the
   * far lane, 3 turning at the right end, 1 flying left on the near lane, 2 turning at the left
   * end. `time` runs from 0 to 1 through a turn and `vx` is the horizontal speed.
   */
  flight: { phase: 0 | 1 | 2 | 3; time: number; vx: number };
  /** Degrees: 0 facing left, 90 towards the viewer, 180 right, 270 away (0x5c8c). */
  heading: number;
  /** Nose-up angle of the body in degrees, on the way down and after lift-off (`plane+0x2fc`). */
  pitch: number;
  scale: number;
  queue: Place[];
  /** Place the plane is at or travelling to. */
  place: Place | null;
  /** Has touched down (`plane+0x268`). */
  landed: boolean;
  /** Services already done or not needed (`plane+0x26a`…`+0x26d`). */
  serviceDone: boolean;
  gasDone: boolean;
  washDone: boolean;
  luggageDone: boolean;
  unloaded: boolean;
  loaded: boolean;
  need: number;
  selected: boolean;
  /** True from the order to land until the plane has stopped on the runway (state 13). */
  landing: boolean;
  /**
   * The landing under way (`plane+0x330`): 0 leaving the screen, 2 gliding down, 3 the moment
   * after touching down, 4 braking. `time` is the phase's clock; `vx`, `vy` and `ax` the speed
   * and acceleration.
   */
  approach: { phase: 0 | 2 | 3 | 4; time: number; vx: number; vy: number; ax: number } | null;
  /** Ground speed while taxiing or on the take-off run. */
  speed: number;
  /** Remaining taxi waypoints, ending at the target place's node. */
  path: Point[];
  /** Seconds spent in the current airborne phase. */
  timer: number;
  gone: boolean;
}

export type SimEvent =
  | { type: 'spawn'; plane: Plane }
  | { type: 'select'; plane: Plane }
  | { type: 'order'; plane: Plane; place: Place }
  | { type: 'forbidden'; plane?: Plane }
  | { type: 'balloonPopped'; x: number; y: number }
  | { type: 'coinReleased'; x: number; y: number }
  | { type: 'bonusPaid'; x: number; y: number; amount: number }
  | { type: 'helicopterArrived' }
  | { type: 'helicopterLeft' }
  | { type: 'coffeeReady' }
  | { type: 'coffeeServed'; planes: Plane[] }
  | { type: 'paintingReady'; spot: StopSpot }
  | { type: 'paintingStarted'; plane: Plane; spot: StopSpot; color: PlaneColor }
  | { type: 'repainted'; plane: Plane; from: PlaneColor }
  | { type: 'paintingDone'; plane: Plane; spot: StopSpot }
  | { type: 'queueCancelled'; plane: Plane }
  | { type: 'score'; plane: Plane; points: number; multiplier: number; reason: 'landing' | 'gate' | 'takeOff' | 'gas' | 'service' | 'left' }
  | { type: 'serviceStartedAtHangar'; plane: Plane; hangar: Hangar }
  | { type: 'serviceFinishedAtHangar'; plane: Plane; hangar: Hangar }
  | { type: 'parked'; plane: Plane; spot: StopSpot }
  | { type: 'fuelingStarted'; plane: Plane; station: GasStation }
  | { type: 'fuelingFinished'; plane: Plane; station: GasStation }
  | { type: 'punctuality'; plane: Plane; result: Punctuality }
  | { type: 'passengerDelivered'; plane: Plane; passenger: 'PREGNANT' | 'ORGAN' }
  | { type: 'serviceStarted'; plane: Plane; gate: Gate; service: 'unloading' | 'loading' }
  | { type: 'serviceFinished'; plane: Plane; gate: Gate; service: 'unloading' | 'loading' }
  | { type: 'landingStarted'; plane: Plane; runway: Runway }
  | { type: 'landingApproach'; plane: Plane; runway: Runway }
  | { type: 'touchdown'; plane: Plane; runway: Runway }
  | { type: 'landed'; plane: Plane; runway: Runway }
  | { type: 'takeOff'; plane: Plane; runway: Runway }
  | { type: 'leftAngry'; plane: Plane }
  | { type: 'departed'; plane: Plane }
  | { type: 'timeOver' }
  | { type: 'levelEnd'; score: number };

export interface SimulationConfig {
  layout: StageLayout;
  schedule: LevelSchedule;
  goals: LevelGoals;
  planes: Map<number, PlaneDescriptor>;
  gates: Map<number, GateDescriptor>;
  runways: Map<number, RunwayDescriptor>;
  gasStations?: Map<number, GasStationDescriptor>;
  hangars?: Map<number, HangarDescriptor>;
  /** Level number within the stage; some places only exist from a given level. */
  level?: number;
  /** Improvement ids the player owns. */
  improvements?: ReadonlySet<number>;
  /** Source of the chance the bonus events use (libc `rand` in the original); `Math.random` by default. */
  random?: () => number;
  screenWidth: number;
}

const inside = (r: Rect, x: number, y: number): boolean => x >= r.x1 && x < r.x2 && y >= r.y1 && y < r.y2;

export class Simulation {
  time = 0;
  score = 0;
  ended = false;
  readonly planes: Plane[] = [];
  readonly gates: Gate[] = [];
  readonly runways: Runway[] = [];
  readonly gasStations: GasStation[] = [];
  readonly hangars: Hangar[] = [];
  readonly stopSpots: StopSpot[] = [];
  /** This level's bonus event, if it has one, and the seconds until it starts. */
  readonly bonus: BonusEvent | null;
  private bonusDelay = 0;
  /** Balloons still to be released and the seconds until the next one. */
  private balloonsLeft = 0;
  private balloonTimer = 0;
  readonly balloons: Balloon[] = [];
  readonly coins: Coin[] = [];
  helicopter: Helicopter | null = null;
  private helicopterDue = false;
  private nextBonusId = 1;
  private readonly random: () => number;
  /** The coffee and cake service, when the improvement is owned. */
  readonly coffee: ServiceButton | null;
  /** The colours used in this level; the painting stop spot offers these (`airport+0x15c`). */
  readonly colors: readonly PlaneColor[];
  readonly counts: Record<'unload' | 'takeOff', Record<Punctuality, number>> = {
    unload: { EARLY: 0, ON_TIME: 0, LATE: 0 },
    takeOff: { EARLY: 0, ON_TIME: 0, LATE: 0 },
  };
  planesLost = 0;
  planesServed = 0;
  selected: Plane | null = null;
  readonly graph = new TaxiGraph();

  private readonly pending: PlaneSpawn[];
  private nextPlaneId = 1;
  private events: SimEvent[] = [];
  /** The level's time has run out (`level+0x90`); play goes on until the airport is done. */
  timeOver = false;
  /** Seconds until the end of the level is next considered (`level+0x1dc`). */
  private endDelay = 0;

  constructor(private readonly config: SimulationConfig) {
    const owned = config.improvements ?? new Set<number>();
    const { layout } = config;

    for (const slot of layout.gates) {
      if (slot.requires && !slot.requires.some((id) => owned.has(id))) continue;
      const upgraded = owned.has(slot.upgradedBy);
      const type = layout.gateTypes[upgraded ? 1 : 0];
      const descriptor = config.gates.get(type);
      if (!descriptor) throw new Error(`Missing gate descriptor ${type}`);
      const position = (upgraded && slot.upgradedPosition) || slot.position;
      const { x, y } = position;
      const node = { x: x + descriptor.node.x, y: y + descriptor.node.y };
      this.gates.push({
        kind: 'gate',
        id: `gate-${slot.letter}`,
        letter: slot.letter,
        position,
        descriptor,
        node,
        taxiNode: this.graph.addGate(
          node,
          descriptor.friendNodes.map((p) => ({ x: x + p.x, y: y + p.y })),
        ),
        click: { x1: x + descriptor.click.x1, y1: y + descriptor.click.y1, x2: x + descriptor.click.x2, y2: y + descriptor.click.y2 },
        plane: null,
        lastColor: null,
        combo: 0,
        service: 'idle',
        samePlane: false,
        progress: 0,
      });
    }

    // Same creation order as the stage builder: gates, gas station, taxi nodes, runways.
    const stationDescriptor = config.gasStations?.get(layout.gasStationType);
    if (stationDescriptor && (config.level ?? 1) >= layout.gasStation.minLevel) {
      const { x, y } = layout.gasStation.position;
      const node = { x: x + stationDescriptor.node.x, y: y + stationDescriptor.node.y };
      const click = stationDescriptor.click;
      this.gasStations.push({
        kind: 'gasStation',
        id: 'gas-station',
        position: layout.gasStation.position,
        descriptor: stationDescriptor,
        node,
        taxiNode: this.graph.addGasStation(node),
        click: { x1: x + click.x1, y1: y + click.y1, x2: x + click.x2, y2: y + click.y2 },
        plane: null,
        use: 'free',
        progress: 0,
      });
    }
    const hangarDescriptor = layout.hangar ? config.hangars?.get(layout.hangar.type) : undefined;
    if (layout.hangar && hangarDescriptor && (config.level ?? 1) >= layout.hangar.minLevel) {
      const { x, y } = layout.hangar.position;
      const node = { x: x + hangarDescriptor.node.x, y: y + hangarDescriptor.node.y };
      const click = hangarDescriptor.click;
      const hangarNodes = this.graph.addHangar(node);
      this.hangars.push({
        kind: 'hangar',
        id: 'hangar',
        position: layout.hangar.position,
        descriptor: hangarDescriptor,
        node,
        taxiNode: hangarNodes.hangar,
        exitTaxiNode: hangarNodes.exit,
        click: { x1: x + click.x1, y1: y + click.y1, x2: x + click.x2, y2: y + click.y2 },
        plane: null,
        use: 'free',
        progress: 0,
      });
    }
    for (const node of layout.taxiNodes) this.graph.addNode(node, false);

    const runwayDescriptor = config.runways.get(layout.runwayType);
    if (!runwayDescriptor) throw new Error(`Missing runway descriptor ${layout.runwayType}`);
    for (const slot of layout.runways) {
      const { x, y } = slot.position;
      this.runways.push({
        kind: 'runway',
        id: `runway-${slot.number}`,
        number: slot.number,
        position: slot.position,
        descriptor: runwayDescriptor,
        node: slot.node,
        taxiNode: this.graph.addRunway(slot.position, slot.node.x < x ? -1 : 1, Math.abs(slot.node.x - x)),
        // The node sits at the end where landings stop and take-offs start, so the take-off run
        // heads from the node towards the runway centre.
        direction: slot.node.x < x ? 1 : -1,
        heading: slot.heading,
        click: { x1: x - RULES.runwayHalfWidth, y1: y - RULES.runwayHalfHeight, x2: x + RULES.runwayHalfWidth, y2: y + RULES.runwayHalfHeight },
        plane: null,
        use: 'free',
        landings: { count: 0, value: 0, active: false },
        takeOffs: { count: 0, value: 0, active: false },
      });
    }

    // Stop spots come last in the stage builder.
    for (const slot of layout.stopSpots) {
      // The painting stop spot takes this place whether or not the plain one had been bought.
      const paints = slot.replacedBy !== undefined && owned.has(slot.replacedBy);
      if (!paints && slot.requires !== null && !owned.has(slot.requires)) continue;
      const vip = slot.upgradedBy !== undefined && owned.has(slot.upgradedBy);
      const { x, y } = slot.position;
      const click = RULES.stopSpotClick;
      this.stopSpots.push({
        kind: 'stopSpot',
        id: `stop-spot-${this.stopSpots.length + 1}`,
        position: slot.position,
        node: slot.position,
        taxiNode: this.graph.addStopSpot(slot.position),
        click: { x1: x + click.x1, y1: y + click.y1, x2: x + click.x2, y2: y + click.y2 },
        plane: null,
        vip,
        drain: vip ? RULES.stopSpotDrain.vip : RULES.stopSpotDrain.normal,
        use: 'free',
        // It starts empty and has to charge before the first repaint (0x67c40).
        painting: paints ? { recharge: RULES.painting.recharge, left: RULES.painting.recharge, ready: false, job: null } : null,
      });
    }

    this.graph.autoLink();

    this.pending = [...config.schedule.planes].sort((a, b) => a.time - b.time);
    this.random = config.random ?? Math.random;
    this.bonus = layout.bonuses?.[config.level ?? 1] ?? null;
    if (this.bonus) {
      this.bonusDelay = this.bonus.delay;
      if (this.bonus.kind === 'balloons') this.balloonsLeft = RULES.bonus.balloons.count;
      else this.helicopterDue = true;
    }
    // It starts empty, like the painting spot (0x24010).
    this.coffee = owned.has(IMPROVEMENT.COFFEE_AND_CAKE) ? { recharge: RULES.coffee.recharge, left: RULES.coffee.recharge, ready: false } : null;
    // 0x133fc: the colours the level's planes come in, in the order of the colour table.
    this.colors = COLOR_NAMES.filter((name) => config.schedule.planes.some((p) => p.color === name));
  }

  get places(): Place[] {
    return [...this.gates, ...this.gasStations, ...this.hangars, ...this.stopSpots, ...this.runways];
  }

  get goals(): LevelGoals {
    return this.config.goals;
  }

  get totalTime(): number {
    return this.config.schedule.totalTime;
  }

  /** Events raised since the last call, for the view and audio. */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ------------------------------------------------------------------ input

  /** Mirrors the original press handler: planes first, then places, then empty space. */
  press(x: number, y: number): void {
    if (this.ended) return;
    const plane = this.planeAt(x, y);
    if (plane) {
      if (UNSELECTABLE_STATES.has(plane.state)) {
        this.emit({ type: 'forbidden' });
        return;
      }
      this.select(plane);
      return;
    }
    const selected = this.selected;
    if (!selected) return;
    const place = this.places.find((p) => inside(p.click, x, y));
    if (place) {
      if (this.addOrder(selected, place)) this.emit({ type: 'order', plane: selected, place });
      else this.emit({ type: 'forbidden', plane: selected });
      return;
    }
    this.cancelQueue(selected);
  }

  planeAt(x: number, y: number): Plane | null {
    let best: Plane | null = null;
    let bestDistance = Infinity;
    for (const plane of this.planes) {
      if (plane.gone) continue;
      const dx = x - plane.x;
      const dy = y - (plane.y - plane.altitude);
      if (Math.abs(dx) > 34 || Math.abs(dy) > 28) continue;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        best = plane;
        bestDistance = distance;
      }
    }
    return best;
  }

  select(plane: Plane): void {
    if (this.selected) this.selected.selected = false;
    this.selected = plane;
    plane.selected = true;
    this.emit({ type: 'select', plane });
  }

  /** `Plane::addOrder` (0x5ad8). */
  addOrder(plane: Plane, place: Place): boolean {
    if (plane.queue.length >= RULES.maxQueuedOrders) return false;
    // In the original the runway stays at the head of the queue until touch-down, so a landing
    // plane does not count as having an empty queue.
    const atRest = plane.queue.length === 0 && !plane.landing && (plane.state === PlaneState.FLYING || plane.state === PlaneState.WAITING);
    if (atRest && !this.canEnter(place, plane)) return false;
    if (plane.queue.includes(place)) return false;
    if (plane.place === place) return false;
    if (!this.accepts(place, plane)) return false;
    plane.queue.push(place);
    return true;
  }

  cancelQueue(plane: Plane): void {
    if (plane.queue.length === 0) return;
    plane.queue.length = 0;
    this.emit({ type: 'queueCancelled', plane });
  }

  /** `0x6b530`: does the plane's current place, target or queue include a place of this kind? */
  private itineraryHas(plane: Plane, kind: Place['kind']): boolean {
    return plane.place?.kind === kind || plane.queue.some((p) => p.kind === kind);
  }

  /** Place virtual slot 11 (gate `0x43e04`, runway `0x6e328`): may this place join the itinerary? */
  private accepts(place: Place, plane: Plane): boolean {
    if (this.itineraryHas(plane, place.kind)) return false;
    if (place.kind === 'runway') {
      if (!plane.landed) return true;
      if (!plane.unloaded) return false;
      return plane.loaded || this.itineraryHas(plane, 'gate');
    }
    if (place.kind === 'stopSpot') {
      // 0x7983c: a parking place. A flying plane needs its landing queued; before unloading it
      // cannot follow a gate, and after unloading it cannot be added once a runway is planned.
      if (!plane.landed && !this.itineraryHas(plane, 'runway')) return false;
      if (plane.unloaded) return !plane.landed || !this.itineraryHas(plane, 'runway');
      return !this.itineraryHas(plane, 'gate');
    }
    if (place.kind === 'hangar') {
      // 0x4785c: only for a plane that has unloaded and still needs servicing.
      return !plane.serviceDone && plane.unloaded;
    }
    if (place.kind === 'gasStation') {
      // 0x410d0: only for a plane that has unloaded and still needs fuel. Hangar service, when
      // needed, has to be done or queued first.
      if (plane.gasDone || !plane.unloaded) return false;
      return plane.serviceDone || this.itineraryHas(plane, 'hangar');
    }
    if (!plane.unloaded) return plane.landed || this.itineraryHas(plane, 'runway');
    // 0x43e04: an unloaded plane returns to a gate to load, with every pending service already
    // done or queued before it.
    if (plane.loaded) return false;
    if (!plane.gasDone && !this.itineraryHas(plane, 'gasStation')) return false;
    if (!plane.serviceDone && !this.itineraryHas(plane, 'hangar')) return false;
    return plane.luggageDone;
  }

  /** Place virtual slot 15 (gate `0x43530`, runway `0x6da34`, gas station `0x40d4c`): may the plane go there now? */
  private canEnter(place: Place, plane: Plane): boolean {
    if (place.kind === 'runway') return !plane.landed || (plane.unloaded && plane.loaded);
    if (place.kind === 'gasStation') return plane.landed && plane.unloaded && plane.serviceDone && !plane.gasDone;
    if (place.kind === 'stopSpot') return plane.landed;
    if (place.kind === 'hangar') return plane.landed && plane.unloaded && !plane.serviceDone;
    if (!plane.landed || plane.loaded) return false;
    return !plane.unloaded || (plane.serviceDone && plane.gasDone && plane.luggageDone);
  }

  /** Place virtual slot 14 (gate `0x43510`, runway `0x6da24`, gas station `0x40d40`). */
  private busy(place: Place, plane: Plane): boolean {
    if (place.kind !== 'gate') return place.use !== 'free';
    if (place.service === 'idle') return false;
    return !(place.service === 'loaded' && place.plane === plane);
  }

  /** Place virtual slot 13 (gate `0x435a8`, runway `0x6d9e4`). */
  private reserve(place: Place, plane: Plane): void {
    if (place.kind === 'gate') {
      place.samePlane = place.plane === plane;
      place.service = 'reserved';
    } else if (place.kind === 'gasStation' || place.kind === 'stopSpot' || place.kind === 'hangar') {
      place.use = 'reserved';
    } else {
      place.use = plane.state === PlaneState.FLYING ? 'landing' : 'takeOffReserved';
    }
    place.plane = plane;
  }

  // ------------------------------------------------------------------ update

  update(dt: number): void {
    if (this.ended) return;
    this.time += dt;

    while (this.pending.length > 0 && this.pending[0]!.time <= this.time) this.spawn(this.pending.shift()!);

    for (const runway of this.runways) this.updateRunway(runway, dt);
    for (const gate of this.gates) this.updateGate(gate, dt);
    for (const station of this.gasStations) this.updateGasStation(station, dt);
    for (const hangar of this.hangars) this.updateHangar(hangar, dt);
    for (const spot of this.stopSpots) if (spot.painting) this.updatePainting(spot, spot.painting, dt);
    if (this.coffee && !this.coffee.ready) {
      // 0x240f4: it counts down and is ready on the update after reaching zero.
      if (this.coffee.left >= 0) this.coffee.left -= dt;
      else {
        this.coffee.ready = true;
        this.emit({ type: 'coffeeReady' });
      }
    }
    for (const plane of this.planes) if (!plane.gone) this.updatePlane(plane, dt);
    this.updateBonus(dt);

    this.updateEnd(dt);
  }

  /**
   * The colours a painting stop spot offers the plane parked on it: every colour of the level
   * but the plane's own, once the spot has recharged (0x67f48, 0x68f08). Empty otherwise.
   */
  paintOptions(spot: StopSpot): readonly PlaneColor[] {
    const booth = spot.painting;
    const plane = spot.plane;
    if (!booth || !booth.ready || booth.job || !plane) return [];
    if (spot.use !== 'occupied' || plane.state !== PlaneState.WAITING) return [];
    return this.colors.filter((color) => color !== plane.color);
  }

  /** The bonus event and the coins it has released. */
  private updateBonus(dt: number): void {
    const rule = RULES.bonus;
    if (this.bonus && this.bonusDelay > 0) this.bonusDelay -= dt;
    else if (this.bonus?.kind === 'balloons' && this.balloonsLeft > 0) {
      // 0x21ade: one balloon whenever the clock runs out, then 1 to 2 s until the next.
      this.balloonTimer -= dt;
      while (this.balloonTimer < 0 && this.balloonsLeft > 0) {
        const b = rule.balloons;
        this.balloons.push({ id: this.nextBonusId++, x: b.minX + this.random() * b.spanX, y: b.startY, image: Math.floor(this.random() * b.images) % b.images });
        this.balloonTimer += b.minGap + this.random() * b.gapSpan;
        this.balloonsLeft--;
      }
    } else if (this.bonus?.kind === 'helicopter' && this.helicopterDue) {
      this.helicopterDue = false;
      const { speed, fromLeft } = this.bonus;
      this.helicopter = { x: fromLeft ? rule.helicopter.leftEdge : rule.helicopter.rightEdge, y: rule.helicopter.y, progress: 0, speed, burst: 0, fromLeft, phases: [this.random() * Math.PI, this.random() * Math.PI], released: 0 };
      this.emit({ type: 'helicopterArrived' });
    }

    for (let i = this.balloons.length - 1; i >= 0; i--) {
      const balloon = this.balloons[i]!;
      balloon.y -= rule.balloons.rise * dt;
      if (balloon.y < rule.balloons.goneY) this.balloons.splice(i, 1);
    }

    const helicopter = this.helicopter;
    if (helicopter) {
      const h = rule.helicopter;
      helicopter.burst = helicopter.burst > 0 ? helicopter.burst - helicopter.speed * dt : 0;
      helicopter.progress += (helicopter.speed + h.burstWeight * helicopter.burst) * dt;
      const t = helicopter.progress;
      helicopter.x = helicopter.fromLeft ? h.leftEdge + h.pace * t : h.rightEdge - h.pace * t;
      helicopter.y = h.y + 15 * Math.sin(1.5 * t + helicopter.phases[0]) + 20 * Math.sin(t + helicopter.phases[1]);
      if (helicopter.x < h.leftEdge || helicopter.x > h.rightEdge) {
        this.helicopter = null;
        this.emit({ type: 'helicopterLeft' });
      }
    }

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i]!;
      coin.time += dt;
      if (coin.phase === 0) {
        coin.scale += rule.coin.grow * dt;
        if (coin.scale > 1) coin.phase = 1;
      } else if (coin.phase === 1) {
        coin.y += rule.coin.fall * dt;
        if (coin.y > rule.coin.payY) {
          // 0x25de0: the amount goes to the score, with its number floating up and the till.
          coin.phase = 2;
          coin.scale = 1;
          this.score += coin.amount;
          this.emit({ type: 'bonusPaid', x: coin.x, y: coin.y, amount: coin.amount });
        }
      } else {
        coin.scale -= rule.coin.grow * dt;
        if (coin.scale <= 0) this.coins.splice(i, 1);
      }
    }
  }

  private releaseCoin(x: number, y: number, amount: number): void {
    this.coins.push({ id: this.nextBonusId++, x, y: y + RULES.bonus.coin.dropBelow, amount, phase: 0, scale: 0, time: 0 });
  }

  /**
   * A touch on a bonus object: a balloon pops (0x22044) or the helicopter is tapped (0x4974c),
   * and either releases a coin. Returns whether the touch landed on one.
   */
  tapBonus(x: number, y: number): boolean {
    if (this.ended || !this.bonus) return false;
    const rule = RULES.bonus;
    const helicopter = this.helicopter;
    if (helicopter && Math.abs(x - helicopter.x) <= rule.helicopter.reachX && Math.abs(y - helicopter.y) <= rule.helicopter.reachY) {
      helicopter.released++;
      this.releaseCoin(helicopter.x, helicopter.y, this.bonus.amount);
      helicopter.burst = rule.helicopter.burst;
      helicopter.speed += rule.helicopter.faster;
      this.emit({ type: 'coinReleased', x: helicopter.x, y: helicopter.y });
      return true;
    }
    const index = this.balloons.findIndex((b) => Math.abs(x - b.x) <= rule.balloons.reach && Math.abs(y - b.y) <= rule.balloons.reach);
    if (index < 0) return false;
    const [balloon] = this.balloons.splice(index, 1) as [Balloon];
    this.releaseCoin(balloon.x, balloon.y, this.bonus.amount);
    this.emit({ type: 'balloonPopped', x: balloon.x, y: balloon.y });
    return true;
  }

  /**
   * The end of the level (0x117da). When the time runs out play goes on: the level is over once
   * no plane holds it, and one holds it while it has energy left or, exhausted, is anywhere but
   * waiting on the ground. The check is repeated after a delay that depends on what was found.
   */
  private updateEnd(dt: number): void {
    const end = RULES.levelEnd;
    if (!this.timeOver) {
      if (this.time <= this.totalTime) return;
      this.timeOver = true;
      this.endDelay = this.planes.some((p) => !p.gone && p.landed) ? end.afterTimeOverLanded : end.afterTimeOver;
      this.emit({ type: 'timeOver' });
      return;
    }
    this.endDelay = Math.max(0, this.endDelay - dt);
    if (this.endDelay > 0) return;
    const holder = this.planes.find((p) => !p.gone && (p.energy > 0 || !(p.landed && p.state === PlaneState.WAITING)));
    if (holder) {
      this.endDelay = holder.energy <= 0 && holder.landed ? end.retryLanded : end.retry;
      return;
    }
    this.ended = true;
    this.emit({ type: 'levelEnd', score: this.score });
  }

  /**
   * Coffee and cake is served (0x244a8, 0x107d4): every plane that has landed and not yet
   * finished loading cheers up, and the button has to recharge.
   */
  serveCoffee(): boolean {
    const coffee = this.coffee;
    if (this.ended || !coffee || !coffee.ready) return false;
    coffee.left = coffee.recharge;
    coffee.ready = false;
    const planes = this.planes.filter((plane) => !plane.gone && plane.landed && !plane.loaded);
    for (const plane of planes) this.addEnergy(plane, RULES.coffee.energy);
    this.emit({ type: 'coffeeServed', planes });
    return true;
  }

  /** `PaintingStopSpot::paint` (0x68014): starts repainting the parked plane. */
  paint(spot: StopSpot, color: PlaneColor): boolean {
    if (this.ended || !this.paintOptions(spot).includes(color)) return false;
    const plane = spot.plane!;
    plane.state = PlaneState.PAINTING;
    spot.painting!.job = { color, time: 0, applied: false };
    this.emit({ type: 'paintingStarted', plane, spot, color });
    return true;
  }

  /** `PaintingStopSpot::update` (0x67e24) and the spray's own update (0x77a80). */
  private updatePainting(spot: StopSpot, booth: PaintBooth, dt: number): void {
    if (!booth.ready) {
      booth.left -= dt;
      if (booth.left <= 0) {
        booth.left = 0;
        booth.ready = true;
        this.emit({ type: 'paintingReady', spot });
      }
    }
    const job = booth.job;
    const plane = spot.plane;
    if (!job || !plane) return;
    job.time += dt;
    if (!job.applied && job.time > RULES.painting.colorAt) {
      job.applied = true;
      const from = plane.color;
      plane.color = job.color;
      this.emit({ type: 'repainted', plane, from });
    }
    if (job.time < RULES.painting.duration) return;
    // 0x67df8: the plane waits again, cheered up, and the spot has to recharge.
    booth.job = null;
    plane.state = PlaneState.WAITING;
    this.addEnergy(plane, RULES.painting.energy);
    booth.left = booth.recharge;
    booth.ready = false;
    this.emit({ type: 'paintingDone', plane, spot });
  }

  private spawn(spawn: PlaneSpawn): void {
    const descriptor = this.config.planes.get(spawn.type);
    if (!descriptor) throw new Error(`Missing plane descriptor ${spawn.type}`);
    const start = RULES.spawn[spawn.side];
    const plane: Plane = {
      id: this.nextPlaneId++,
      descriptor,
      color: spawn.color,
      sex: spawn.sex,
      passenger: spawn.passengers === 'PRESIDENT' || spawn.passengers === 'PREGNANT' || spawn.passengers === 'ORGAN' ? spawn.passengers : null,
      state: PlaneState.FLYING,
      energy: RULES.initialEnergy,
      x: start.x,
      y: start.y,
      altitude: RULES.flightAltitude,
      facing: spawn.side === 'RIGHT' ? -1 : 1,
      flight: { phase: spawn.side === 'RIGHT' ? 1 : 0, time: 0, vx: (spawn.side === 'RIGHT' ? -1 : 1) * RULES.flightSpeed },
      heading: spawn.side === 'RIGHT' ? 0 : 180,
      pitch: 0,
      scale: start.scale,
      queue: [],
      place: null,
      landed: false,
      serviceDone: !spawn.needService,
      gasDone: !spawn.needGas,
      washDone: !spawn.needWash,
      luggageDone: !spawn.needLuggage,
      unloaded: false,
      loaded: false,
      need: Need.LAND,
      selected: false,
      landing: false,
      approach: null,
      speed: 0,
      path: [],
      timer: 0,
      gone: false,
    };
    this.planes.push(plane);
    this.emit({ type: 'spawn', plane });
  }

  private updatePlane(plane: Plane, dt: number): void {
    this.drainEnergy(plane, dt);
    switch (plane.state) {
      case PlaneState.FLYING:
        this.updateFlying(plane, dt);
        break;
      case PlaneState.LANDING:
        this.updateLanding(plane, dt);
        break;
      case PlaneState.LEAVING_ANGRY:
        plane.heading = plane.facing > 0 ? 180 : 0;
        plane.x += plane.facing * RULES.flightSpeed * dt;
        if (this.offScreen(plane)) this.remove(plane);
        break;
      case PlaneState.WAITING:
        if (plane.queue.length > 0) this.startNextOrder(plane);
        break;
      case PlaneState.TAXIING:
        this.updateTaxi(plane, dt);
        break;
      case PlaneState.TAKING_OFF:
      case PlaneState.AIRBORNE: {
        const runway = plane.place as Runway;
        plane.speed += RULES.takeOffAcceleration * dt;
        plane.x += runway.direction * plane.speed * dt;
        plane.facing = runway.direction;
        plane.heading = runway.direction > 0 ? 180 : 0;
        if (plane.state === PlaneState.TAKING_OFF) {
          if (Math.abs(plane.x - runway.node.x) > RULES.liftOffDistance) {
            plane.state = PlaneState.AIRBORNE;
            plane.timer = 0;
          }
          break;
        }
        plane.timer += dt;
        // 0x7d34: the nose comes up faster and faster.
        plane.pitch = RULES.pitch.climb * plane.timer * plane.timer;
        plane.altitude += RULES.climbRate * dt;
        if (plane.timer >= RULES.airborneTime) {
          this.planesServed++;
          this.emit({ type: 'departed', plane });
          this.remove(plane);
        }
        break;
      }
      default:
        break;
    }
  }

  private drainEnergy(plane: Plane, dt: number): void {
    if (!RULES.drainingStates.has(plane.state)) return;
    if (plane.energy <= RULES.minEnergy) return;
    const fallTime = plane.sex === 'MALE' ? plane.descriptor.times.maleEnergyFall : plane.descriptor.times.femaleEnergyFall;
    // A stop spot the plane is parked on scales the drain (`plane+0x320`, set by 0x79788).
    const parked = plane.place?.kind === 'stopSpot' && plane.place.use === 'occupied' ? plane.place.drain : 1;
    const rate = (1 / fallTime) * (plane.passenger ? RULES.specialPassengerDrainFactor : 1) * parked;
    plane.energy = Math.max(RULES.minEnergy, plane.energy - rate * dt);
  }

  private updateFlying(plane: Plane, dt: number): void {
    if (plane.queue.length > 0) {
      this.startNextOrder(plane);
      // Keep circling while the runway is taken.
      if (plane.state !== PlaneState.FLYING) return;
    }
    const { flight } = plane;
    const rule = RULES.holding;
    const far = RULES.spawn.LEFT;
    const near = RULES.spawn.RIGHT;
    const speed = RULES.flightSpeed;
    if (flight.phase === 0 || flight.phase === 1) {
      const right = flight.phase === 0;
      flight.vx = right ? speed : -speed;
      plane.x += flight.vx * dt;
      const past = right ? plane.x - rule.rightTurn : rule.leftTurn - plane.x;
      if (past >= 0) {
        // The original decides at the turn whether an exhausted plane gives up.
        if (plane.energy < 0) {
          this.giveUp(plane);
          return;
        }
        flight.phase = right ? 3 : 2;
        flight.time = past / speed;
      }
    } else {
      // A half loop out and back while it changes lane and size.
      const right = flight.phase === 3;
      flight.time += dt / rule.turnTime;
      if (flight.time < 1) {
        const swing = Math.sin(Math.PI * flight.time) * (speed / rule.turnWidth);
        const across = Math.sin((Math.PI / 2) * flight.time);
        plane.x = right ? rule.rightTurn + swing : rule.leftTurn - swing;
        plane.y = right ? far.y + (near.y - far.y) * across : near.y - (near.y - far.y) * across;
        plane.scale = right ? far.scale + (near.scale - far.scale) * across : near.scale - (near.scale - far.scale) * across;
        flight.vx = (right ? 1 : -1) * Math.cos(Math.PI * flight.time) * (speed / rule.turnWidth);
      } else {
        const lane = right ? near : far;
        flight.phase = right ? 1 : 0;
        flight.time = 0;
        flight.vx = right ? -speed : speed;
        plane.y = lane.y;
        plane.scale = lane.scale;
      }
    }
    if (flight.vx !== 0) plane.facing = flight.vx > 0 ? 1 : -1;
    plane.heading = plane.facing > 0 ? 180 : 0;
  }

  /** `Plane::giveUp` (0x6a24): the plane leaves, charging its LeavingPoints; the score may go negative. */
  private giveUp(plane: Plane): void {
    plane.state = PlaneState.LEAVING_ANGRY;
    if (this.selected === plane) this.deselect();
    this.planesLost++;
    this.emit({ type: 'leftAngry', plane });
    this.addScore(plane, -plane.descriptor.points.leaving, 1, 'left');
  }

  /** Starts the first queued order once its place can take the plane (update, `0x7952` onwards). */
  private startNextOrder(plane: Plane): void {
    const waiting = plane.state === PlaneState.WAITING;
    if (waiting) this.skipParking(plane);
    const place = plane.queue[0]!;
    if (!this.canEnter(place, plane)) {
      plane.queue.length = 0;
      this.emit({ type: 'queueCancelled', plane });
      return;
    }
    if (this.busy(place, plane)) {
      if (waiting) this.resolveCircle(plane);
      return;
    }
    plane.queue.shift();
    const previous = plane.place;
    const from = this.standingNode(plane);
    // The original frees a place once its plane is no longer waiting on it.
    if (previous && previous !== place && previous.plane === plane) this.release(previous);
    this.reserve(place, plane);
    plane.place = place;

    if (plane.state === PlaneState.FLYING) {
      // 0x73c6: the plane keeps its speed and accelerates towards the side it will come back
      // from; runways with heading 0 are approached from the right.
      const runway = place as Runway;
      plane.landing = true;
      plane.state = PlaneState.LANDING;
      plane.approach = { phase: 0, time: 0, vx: plane.flight.vx, vy: 0, ax: runway.direction * RULES.landing.leaveAcceleration };
      this.emit({ type: 'landingStarted', plane, runway });
      return;
    }
    plane.state = PlaneState.TAXIING;
    plane.speed = 0;
    const route = from ? this.graph.route(from, place.taxiNode) : null;
    // Skip the node the plane is standing on; fall back to a straight line if no route exists.
    plane.path = route ? route.slice(1).map((n) => ({ x: n.x, y: n.y })) : [place.node];
  }

  /** Where a plane on the ground sets off from: the node of the place it stands on. */
  private standingNode(plane: Plane): TaxiNode | undefined {
    const place = plane.place;
    // A serviced plane stands at the hangar's exit node, not inside it.
    return place?.kind === 'hangar' && place.use === 'done' ? place.exitTaxiNode : place?.taxiNode;
  }

  /**
   * 0x797e: stop spots at the head of the queue are only somewhere to wait. If they are free and
   * the place after them can be taken right now, the plane goes straight there.
   */
  private skipParking(plane: Plane): void {
    const { queue } = plane;
    let next = 0;
    while (next < queue.length && queue[next]!.kind === 'stopSpot' && !this.busy(queue[next]!, plane)) next++;
    if (next === 0 || next === queue.length) return;
    const place = queue[next]!;
    if (this.busy(place, plane) || !this.canEnter(place, plane)) return;
    const from = this.standingNode(plane);
    if (from && this.graph.route(from, place.taxiNode) === null) return;
    queue.splice(0, next);
  }

  /**
   * 0x7ab4: planes waiting for each other's places. Starting from this plane, each next place
   * must be taken by a waiting plane with orders of its own; if the chain comes back to where
   * this plane stands, every place in it is freed and all of them set off at once.
   */
  private resolveCircle(plane: Plane): void {
    const chain: Place[] = [];
    let current = plane;
    for (;;) {
      const place = current.queue[0];
      if (!place || !this.busy(place, current) || !this.canEnter(place, current)) return;
      const occupant = place.plane;
      if (!occupant || occupant.state !== PlaneState.WAITING || occupant.queue.length === 0) return;
      if (chain.includes(place)) return;
      chain.push(place);
      if (place === plane.place) break;
      current = occupant;
    }
    const movers = chain.map((place) => place.plane!);
    for (const place of chain) this.release(place);
    for (const mover of movers) this.startNextOrder(mover);
  }

  /** The landing, phase by phase (0x7eb2). */
  private updateLanding(plane: Plane, dt: number): void {
    const runway = plane.place as Runway;
    const approach = plane.approach!;
    const rule = RULES.landing;
    if (approach.phase === 0) {
      approach.time += dt;
      plane.scale = Math.min(1, plane.scale + rule.scaleRate * dt);
      if (approach.time < rule.dipTime) approach.vy = rule.dipFactor * (approach.time - rule.dipTime) ** 2;
      approach.vx += approach.ax * dt;
      plane.x += approach.vx * dt;
      plane.y += approach.vy * dt;
      if (approach.vx !== 0) plane.facing = approach.vx > 0 ? 1 : -1;
      plane.heading = plane.facing > 0 ? 180 : 0;
      if (plane.x >= -rule.leaveMargin && plane.x <= this.config.screenWidth + rule.leaveMargin) return;
      // 0x7f68: it comes back in line with the runway.
      approach.phase = 2;
      approach.time = 0;
      plane.facing = runway.direction > 0 ? -1 : 1;
      plane.heading = plane.facing > 0 ? 180 : 0;
      approach.vx = plane.facing * RULES.landingSpeed;
      approach.vy = 0;
      approach.ax = 0;
      plane.x = runway.node.x + runway.direction * RULES.landingApproachDistance;
      plane.y = runway.node.y;
      plane.scale = 1;
      plane.altitude = rule.approachAltitude;
      plane.pitch = RULES.pitch.glide;
      this.emit({ type: 'landingApproach', plane, runway });
      return;
    }
    approach.vx += approach.ax * dt;
    plane.x += approach.vx * dt;
    if (approach.phase === 2) {
      approach.time += (RULES.landingSpeed / rule.glideDistance) * dt;
      if (approach.time < 1) {
        plane.pitch += RULES.pitch.flare * dt;
        plane.altitude = (rule.approachAltitude / 2) * (Math.cos(Math.PI * approach.time) + 1);
        return;
      }
      // 0x8108: touch-down. The braking is the one that stops it exactly on the node.
      const distance = Math.abs(runway.node.x - plane.x);
      approach.phase = 3;
      approach.time = 0;
      plane.altitude = 0;
      approach.ax = distance > 0 ? (-Math.sign(approach.vx) * approach.vx ** 2) / (2 * distance) : 0;
      this.emit({ type: 'touchdown', plane, runway });
      return;
    }
    if (approach.phase === 3) {
      // A slight bounce for a quarter of a second.
      approach.time += dt / rule.bounceTime;
      const t = Math.min(1, approach.time) * rule.bounceTime;
      plane.altitude = approach.time < 1 ? rule.bounceSpeed * t - (rule.bounceSpeed / 2) * t * t : 0;
      if (approach.time >= 1) {
        approach.phase = 4;
        approach.time = 0;
      }
    } else {
      approach.time += dt;
      plane.pitch = Math.max(0, plane.pitch - RULES.pitch.settle * dt);
    }
    // 0x82de: done once the node is no longer ahead.
    if ((runway.node.x - plane.x) * approach.vx > 0) return;
    plane.approach = null;
    plane.pitch = 0;
    plane.x = runway.node.x;
    plane.altitude = 0;
    plane.heading = runway.heading;
    plane.landing = false;
    plane.landed = true;
    if (plane.passenger === 'PREGNANT' || plane.passenger === 'ORGAN') {
      this.emit({ type: 'passengerDelivered', plane, passenger: plane.passenger });
      plane.passenger = null;
    }
    plane.need = Need.UNLOAD;
    this.runwayUsed(runway, plane, true);
  }

  private updateTaxi(plane: Plane, dt: number): void {
    const place = plane.place!;
    // Remaining distance along the whole path: the plane only brakes for the final target.
    let remaining = 0;
    let from: Point = plane;
    for (const point of plane.path) {
      remaining += Math.hypot(point.x - from.x, point.y - from.y);
      from = point;
    }
    const a = RULES.taxiAcceleration;
    const braking = remaining <= (plane.speed * plane.speed) / (2 * a);
    plane.speed = braking ? Math.max(20, plane.speed - a * dt) : Math.min(RULES.taxiMaxSpeed, plane.speed + a * dt);

    let step = plane.speed * dt;
    while (plane.path.length > 0) {
      const next = plane.path[0]!;
      const dx = next.x - plane.x;
      const dy = next.y - plane.y;
      const distance = Math.hypot(dx, dy);
      if (Math.abs(dx) > 1) plane.facing = dx > 0 ? 1 : -1;
      // Heading from the direction of travel: 0 is left, 90 is down the screen.
      if (distance > 0.5) plane.heading = ((Math.atan2(dy, -dx) * 180) / Math.PI + 360) % 360;
      const last = plane.path.length === 1;
      if (distance > (last ? Math.max(step, 1) : step)) {
        plane.x += (dx / distance) * step;
        plane.y += (dy / distance) * step;
        return;
      }
      plane.x = next.x;
      plane.y = next.y;
      step -= distance;
      plane.path.shift();
    }
    if (place.kind === 'gate') this.gateArrival(place, plane);
    else if (place.kind === 'gasStation') this.gasStationArrival(place, plane);
    else if (place.kind === 'hangar' && place.use === 'leaving') {
      // Out at the exit node: the hangar pays and waits for the plane to move on (0x472f4).
      place.use = 'done';
      plane.state = PlaneState.WAITING;
      this.addScore(plane, roundScore(clamp01(plane.energy) * plane.descriptor.points.hangar), 1, 'service');
    } else if (place.kind === 'hangar') {
      // `Hangar::planeArrived` (0x47234).
      place.progress = 0;
      place.use = 'working';
      plane.state = PlaneState.IN_HANGAR;
      this.emit({ type: 'serviceStartedAtHangar', plane, hangar: place });
      this.addEnergy(plane, RULES.energyBoost);
    } else if (place.kind === 'stopSpot') {
      // `StopSpot::planeArrived` (0x79788): the plane simply waits there.
      place.use = 'occupied';
      plane.state = PlaneState.WAITING;
      this.emit({ type: 'parked', plane, spot: place });
    }
    else this.runwayUsed(place, plane);
  }

  /** `Runway::planeDone` (0x6d584): scores a landing or starts a take-off. */
  private runwayUsed(runway: Runway, plane: Plane, landing = false): void {
    const base = roundScore(clamp01(plane.energy) * plane.descriptor.points.runway);
    const track = landing ? runway.landings : runway.takeOffs;

    let multiplier = 1;
    if (track.value > 0) {
      const previous = track.count;
      track.count = previous + 1;
      if (previous >= 1) multiplier = Math.min(track.count, RULES.maxComboMultiplier);
    } else {
      track.count = 1;
    }
    const points = base * multiplier;

    if (landing) {
      this.addEnergy(plane, RULES.energyBoost);
      plane.state = PlaneState.WAITING;
      // The original arms the landing timer when it sees the landed plane waiting (0x6dd0a).
      runway.landings.active = true;
      this.emit({ type: 'landed', plane, runway });
    } else {
      const result = punctuality(plane.energy);
      this.counts.takeOff[result]++;
      this.emit({ type: 'punctuality', plane, result });
      plane.state = PlaneState.TAKING_OFF;
      runway.use = 'takingOff';
      plane.speed = 0;
      plane.queue.length = 0;
      if (this.selected === plane) this.deselect();
      this.emit({ type: 'takeOff', plane, runway });
    }
    this.addScore(plane, points, multiplier, landing ? 'landing' : 'takeOff');
  }

  /** `Gate::planeArrived` (0x43238). */
  private gateArrival(gate: Gate, plane: Plane): void {
    if ((plane.color as unknown) === RULES.neutralColor) {
      gate.lastColor = null;
    } else if (gate.lastColor !== plane.color) {
      gate.combo = 1;
      gate.lastColor = plane.color;
    } else if (!gate.samePlane) {
      gate.combo = Math.min(gate.combo + 1, RULES.maxComboMultiplier);
    }
    const multiplier = Math.max(gate.combo, 1);
    const points = roundScore(clamp01(plane.energy) * plane.descriptor.points.gate * multiplier);
    // On arrival the plane takes the place's heading (0x764a).
    plane.heading = gate.descriptor.planeOrientation;

    gate.progress = 0;
    if (!plane.unloaded) {
      plane.state = PlaneState.UNLOADING;
      plane.queue.length = 0;
      if (this.selected === plane) this.deselect();
      gate.service = 'unloading';
      const result = punctuality(plane.energy);
      this.counts.unload[result]++;
      this.emit({ type: 'punctuality', plane, result });
    } else {
      plane.state = PlaneState.LOADING;
      gate.service = 'loading';
    }
    this.emit({ type: 'serviceStarted', plane, gate, service: gate.service });
    this.addScore(plane, points, multiplier, 'gate');
    this.addEnergy(plane, RULES.energyBoost);
  }

  /** `Runway::update` (0x6db18): combo timers and freeing the runway. */
  private updateRunway(runway: Runway, dt: number): void {
    const { combo } = RULES;
    const advance = (track: ComboTrack, step: number, decay: number): void => {
      if (track.active) track.value = Math.min(1, track.value + combo.charge * step);
      else track.value = Math.max(0, track.value - decay * step);
    };
    // An incoming operation quickly runs down the other kind's combo.
    if (runway.use === 'landing') advance(runway.takeOffs, combo.crossFactor * dt, combo.takeOffDecay);
    else if (runway.use === 'takeOffReserved') advance(runway.landings, combo.crossFactor * dt, combo.landingDecay);

    const step = dt / runway.descriptor.comboTime;
    advance(runway.takeOffs, step, combo.takeOffDecay);
    advance(runway.landings, step, combo.landingDecay);
    for (const track of [runway.takeOffs, runway.landings]) {
      if (track.value === 1) track.active = false;
      if (track.value === 0 && track.count >= 2) track.count = 0;
    }

    // A take-off frees the runway at once and arms its combo timer.
    if (runway.use === 'takingOff') {
      runway.use = 'free';
      runway.plane = null;
      runway.takeOffs.active = true;
    }
  }

  /** `Gate::update` (0x435c8). */
  private updateGate(gate: Gate, dt: number): void {
    const plane = gate.plane;
    if (!plane || (gate.service !== 'unloading' && gate.service !== 'loading')) return;
    gate.progress += gate.descriptor.speed * dt;
    if (gate.progress <= plane.descriptor.times.loading) return;

    const service = gate.service;
    plane.state = PlaneState.WAITING;
    if (service === 'loading') {
      gate.service = 'loaded';
      plane.loaded = true;
      plane.need = Need.TAKE_OFF;
      this.emit({ type: 'serviceFinished', plane, gate, service });
      return;
    }
    gate.service = 'unloaded';
    plane.unloaded = true;
    // `Plane::unloadingFinished` (0x64ac) picks the next need in this order.
    plane.need = !plane.serviceDone ? Need.SERVICE : !plane.gasDone ? Need.GAS : plane.luggageDone ? Need.LOAD : Need.LUGGAGE;
    this.emit({ type: 'serviceFinished', plane, gate, service });
    if (plane.need !== Need.LOAD) return;
    // With no services pending the plane releases the gate, queues it again and "arrives" on the
    // spot, which starts loading.
    gate.service = 'idle';
    this.reserve(gate, plane);
    this.gateArrival(gate, plane);
  }

  /** `GasStation::planeArrived` (0x40cbc). */
  private gasStationArrival(station: GasStation, plane: Plane): void {
    station.progress = 0;
    if (!plane.gasDone) {
      plane.state = PlaneState.FUELING;
      station.use = 'fueling';
      this.emit({ type: 'fuelingStarted', plane, station });
    }
    this.addEnergy(plane, RULES.energyBoost);
  }

  /** `GasStation::update` (0x40dd4). */
  private updateGasStation(station: GasStation, dt: number): void {
    const plane = station.plane;
    if (!plane || station.use !== 'fueling') return;
    station.progress += station.descriptor.speed * dt;
    if (station.progress <= plane.descriptor.times.fueling) return;

    station.use = 'done';
    // `Plane::fuelingFinished` (0x6798).
    plane.gasDone = true;
    plane.state = PlaneState.WAITING;
    plane.need = plane.luggageDone ? Need.LOAD : Need.LUGGAGE;
    this.emit({ type: 'fuelingFinished', plane, station });
    this.addScore(plane, roundScore(clamp01(plane.energy) * plane.descriptor.points.gasStation), 1, 'gas');
  }

  /**
   * `Hangar::update` (0x473dc): when the work is done the plane rolls out to the exit node, and
   * the points are paid once it is waiting there (0x472f4, handled on arrival in `updateTaxi`).
   */
  private updateHangar(hangar: Hangar, dt: number): void {
    const plane = hangar.plane;
    if (!plane || hangar.use !== 'working') return;
    hangar.progress += hangar.descriptor.speed * dt;
    if (hangar.progress <= plane.descriptor.times.servicing) return;

    hangar.use = 'leaving';
    // `Plane::servicingFinished` (0x66c8).
    plane.serviceDone = true;
    plane.need = !plane.gasDone ? Need.GAS : plane.luggageDone ? Need.LOAD : Need.LUGGAGE;
    plane.state = PlaneState.TAXIING;
    plane.speed = 0;
    plane.path = [{ x: hangar.exitTaxiNode.x, y: hangar.exitTaxiNode.y }];
    this.emit({ type: 'serviceFinishedAtHangar', plane, hangar });
  }

  /** Place virtual slot 9 (gate `0x435c0`, runway `0x6db0c`, gas station `0x40dcc`). */
  private release(place: Place): void {
    place.plane = null;
    if (place.kind === 'gate') place.service = 'idle';
    else place.use = 'free';
  }

  /** `Plane::addEnergy` (0x9b18). */
  private addEnergy(plane: Plane, amount: number): void {
    if (plane.state === PlaneState.LEAVING_ANGRY) return;
    plane.energy = Math.min(RULES.maxEnergy, plane.energy + amount);
  }

  private addScore(plane: Plane, points: number, multiplier: number, reason: 'landing' | 'gate' | 'takeOff' | 'gas' | 'service' | 'left'): void {
    this.score += points;
    this.emit({ type: 'score', plane, points, multiplier, reason });
  }

  private offScreen(plane: Plane): boolean {
    return plane.x < -120 || plane.x > this.config.screenWidth + 120;
  }

  private remove(plane: Plane): void {
    plane.gone = true;
    if (plane.place && plane.place.plane === plane) this.release(plane.place);
    if (this.selected === plane) this.deselect();
  }

  private deselect(): void {
    if (this.selected) this.selected.selected = false;
    this.selected = null;
  }

  private emit(event: SimEvent): void {
    this.events.push(event);
  }
}
