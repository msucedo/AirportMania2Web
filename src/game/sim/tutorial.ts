import { Need, PlaneState } from './rules';
import type { Gate, Plane, Runway, SimEvent } from './simulation';

// The tutorial ("Airport Academy", stage 0): three days, each with its goals and the hints it
// gives as things happen. Classes RealTutorial (base, vtable 0x17b9e8), BasicSequenceTutorial
// (0x17ba68), CombosTutorial (0x17bae8) and ExtrasTutorial (0x17bb68). See docs/re-notes.md.

/** Pending, done or failed (`goal+0x20`: 0, 1, 2). */
export type GoalState = 'pending' | 'done' | 'failed';

export interface TutorialGoal {
  /** Text key; one with a counter takes it as its `%d`. */
  text: string;
  /** How many of the two it asks for are done (`goal+0x28`), for the goals that count. */
  count: number | null;
  state: GoalState;
  /** Runs from 0 when the state changes, two a second (`goal+0x24`): the mark's pop. */
  clock: number;
}

/** A hint to show: its picture (`HINTS.<name>`) and the key of its text (0x4aedc). */
export interface TutorialHint {
  image: string;
  text: string;
}

const goal = (text: string, counts = false): TutorialGoal => ({ text, count: counts ? 0 : null, state: 'pending', clock: 0 });

/** What a day's class does besides keeping its goals; each overrides only a few of these. */
export abstract class Tutorial {
  readonly goals: TutorialGoal[];
  /** Hints raised and not yet taken by the scene, in order. */
  readonly hints: TutorialHint[] = [];

  protected constructor(
    readonly day: 1 | 2 | 3,
    goals: TutorialGoal[],
  ) {
    this.goals = goals;
  }

  /** 0x7b45c: the goals' clocks. */
  update(dt: number): void {
    for (const g of this.goals) g.clock += 2 * dt;
  }

  /** 0x7b4a4, when the day ends: what is still pending has failed. */
  finish(): void {
    for (const g of this.goals) if (g.state === 'pending') this.set(g, 'failed');
  }

  /** 0x7b4d0 and 0x11d4c: every goal done, and something scored. */
  passed(score: number): boolean {
    return score > 0 && this.goals.every((g) => g.state === 'done');
  }

  /** The simulation's events, as the plane's and the level's code report them to the tutorial. */
  handle(event: SimEvent): void {
    switch (event.type) {
      case 'spawn':
        return this.planeAppeared(event.plane);
      case 'select':
        return this.planeSelected(event.plane);
      case 'landingStarted':
        return this.landingStarted(event.plane);
      case 'landed':
        return this.landed(event.plane, event.runway);
      case 'takeOff':
        return this.tookOff(event.plane, event.runway);
      case 'serviceStarted':
        return event.service === 'unloading' ? this.unloadingStarted(event.plane, event.gate) : this.loadingStarted(event.plane);
      case 'serviceFinished':
        if (event.service === 'loading') return this.loadingFinished(event.plane);
        this.unloadingFinished(event.plane);
        // 0x6550: with no order waiting, the plane says what it needs next.
        if (event.plane.queue.length > 0) return;
        if (event.plane.need === Need.SERVICE) this.needsRepair();
        else if (event.plane.need === Need.GAS) this.needsFuel();
        else if (event.plane.need === Need.LUGGAGE) this.needsLuggage();
        return;
      case 'serviceFinishedAtHangar':
        return this.repaired();
      case 'fuelingFinished':
        return this.fueled();
      case 'luggageFinished':
        return this.luggageLoaded();
      default:
    }
  }

  protected set(g: TutorialGoal, state: GoalState): void {
    g.state = state;
    g.clock = 0;
  }

  /** A goal that counts to two is done at the second (0x7bbdc). */
  protected countUp(g: TutorialGoal): void {
    g.count = (g.count ?? 0) + 1;
    if (g.count === 2) this.set(g, 'done');
  }

  protected hint(image: string, text: string): void {
    this.hints.push({ image, text });
  }

  protected planeAppeared(_plane: Plane): void {}
  protected planeSelected(_plane: Plane): void {}
  protected landingStarted(_plane: Plane): void {}
  protected landed(_plane: Plane, _runway: Runway): void {}
  protected tookOff(_plane: Plane, _runway: Runway): void {}
  protected unloadingStarted(_plane: Plane, _gate: Gate): void {}
  protected unloadingFinished(_plane: Plane): void {}
  protected loadingStarted(_plane: Plane): void {}
  protected loadingFinished(_plane: Plane): void {}
  protected needsRepair(): void {}
  protected needsFuel(): void {}
  protected needsLuggage(): void {}
  protected repaired(): void {}
  protected fueled(): void {}
  protected luggageLoaded(): void {}
}

/** Day 1: one plane from the air to a gate and back, a hint at every step. */
export class BasicSequenceTutorial extends Tutorial {
  /** Seconds before it says to select the plane, and whether it has (`+0x34`, `+0x38`). */
  private wait = 3;
  private told = false;

  constructor() {
    super(1, [goal('TUTORIAL_DIALOG.LEVEL1.GOAL1'), goal('TUTORIAL_DIALOG.LEVEL1.GOAL2'), goal('TUTORIAL_DIALOG.LEVEL1.GOAL3'), goal('TUTORIAL_DIALOG.LEVEL1.GOAL4')]);
  }

  /** 0x7b600. */
  override update(dt: number): void {
    if (!this.told) {
      this.wait -= dt;
      if (this.wait < 0) {
        this.hint('HINTS.PLANE', 'HINTS.NEED_TO_SELECT');
        this.told = true;
      }
    }
    super.update(dt);
  }

  /** 0x7b664. */
  protected override planeAppeared(): void {
    this.wait = 3;
    this.told = false;
  }

  /** 0x7b674: only for a plane still in the air. */
  protected override planeSelected(plane: Plane): void {
    if (plane.state !== PlaneState.FLYING) return;
    this.hint('HINTS.RUNWAY', 'HINTS.TUTORIAL_SELECTED');
    this.told = true;
  }

  /** 0x7b744. */
  protected override landed(): void {
    this.hint('HINTS.GATE_0', 'HINTS.TUTORIAL_FINISHED_LANDING');
    this.set(this.goals[0]!, 'done');
  }

  /** 0x7b6e8. */
  protected override unloadingStarted(): void {
    this.hint('HINTS.UNLOADING', 'HINTS.TUTORIAL_START_UNLOADING');
    this.set(this.goals[1]!, 'done');
  }

  /** 0x7b71c. */
  protected override unloadingFinished(): void {
    this.hint('HINTS.LOADING', 'HINTS.TUTORIAL_FINISHED_UNLOADING');
  }

  /** 0x7b6b4. */
  protected override loadingStarted(): void {
    this.set(this.goals[2]!, 'done');
  }

  /** 0x7b6c0. */
  protected override loadingFinished(): void {
    this.hint('HINTS.RUNWAY', 'HINTS.TUTORIAL_FINISHED_LOADING');
  }

  /** 0x7b778. */
  protected override tookOff(): void {
    this.set(this.goals[3]!, 'done');
  }
}

/** The palette index of orange, the colour 0x7b8f8 looks for. */
const ORANGE = 'ORANGE';

/** Day 2: a runway combo, and the same colour twice at each gate. */
export class CombosTutorial extends Tutorial {
  /** `+0x34`, `+0x38`: landings and take-offs so far. */
  private landings = 0;
  private takeOffs = 0;
  /** `+0x3c`, `+0x3d`, `+0x3e`: a landing combo made, a take-off combo made, the gate combo explained. */
  private landingCombo = false;
  private takeOffCombo = false;
  private gateComboTold = false;

  constructor() {
    super(2, [goal('TUTORIAL_DIALOG.LEVEL2.GOAL1'), goal('TUTORIAL_DIALOG.LEVEL2.GOAL2', true)]);
  }

  /**
   * 0x7b8f8: counts orange planes coming in to land, on the same counter as the landings, and at
   * two tells where to take one. The day's planes are blue and green, so it never comes up.
   */
  protected override landingStarted(plane: Plane): void {
    if (this.gateComboTold || plane.color !== ORANGE) return;
    this.landings += 1;
    if (this.landings === 2) this.hint('HINTS.TUTORIAL_GATE_COMBO', 'HINTS.TUTORIAL_ORANGE_PLANE_GATE_COMBO');
  }

  /** 0x7b93c. */
  protected override landed(_plane: Plane, runway: Runway): void {
    const before = this.landings;
    this.landings += 1;
    if (this.landingCombo) return;
    if (before === 0) return this.hint('HINTS.TUTORIAL_LANDING_COMBO', 'HINTS.TUTORIAL_TO_GET_A_LANDING_COMBO');
    if (runway.landings.count < 2) return;
    this.hint('HINTS.TUTORIAL_LANDING_COMBO_X2', 'HINTS.TUTORIAL_TO_GET_ANOTHER_LANDING_COMBO');
    this.landingCombo = true;
    this.set(this.goals[0]!, 'done');
  }

  /** 0x7b9b0. */
  protected override tookOff(_plane: Plane, runway: Runway): void {
    const before = this.takeOffs;
    this.takeOffs += 1;
    if (this.takeOffCombo) return;
    if (before === 0) this.hint('HINTS.TUTORIAL_LAUNCHING_COMBO', 'HINTS.TUTORIAL_TO_GET_A_LAUNCHING_COMBO');
    else if (runway.takeOffs.count >= 2) {
      this.hint('HINTS.TUTORIAL_LAUNCHING_COMBO_X2', 'HINTS.TUTORIAL_TO_GET_ANOTHER_LAUNCHING_COMBO');
      this.takeOffCombo = true;
      if (!this.landingCombo) this.set(this.goals[0]!, 'done');
    }
    // Two planes gone and no runway combo of either kind: that goal has failed.
    if (this.takeOffs === 2 && !this.takeOffCombo && !this.landingCombo) this.set(this.goals[0]!, 'failed');
  }

  /** 0x7b874: the gate's colour before this plane (`+0xbc`), now (`+0xc0`) and its count (`+0xc4`). */
  protected override unloadingStarted(_plane: Plane, gate: Gate): void {
    const matches = gate.lastColor === gate.previousColor;
    if (!matches && gate.previousColor !== null) this.set(this.goals[1]!, 'failed');
    if (!matches || gate.combo !== 2) return;
    if (!this.gateComboTold) {
      this.hint('HINTS.TUTORIAL_GATE_COMBO_X2', 'HINTS.TUTORIAL_YOU_MADE_A_GATE_COMBO');
      this.gateComboTold = true;
    }
    this.countUp(this.goals[1]!);
  }
}

/** Day 3: repair, refuel and load luggage on two planes each. */
export class ExtrasTutorial extends Tutorial {
  /** `+0x34`…`+0x36`: each need explained once. */
  private told = { repair: false, fuel: false, luggage: false };

  constructor() {
    super(3, [goal('TUTORIAL_DIALOG.LEVEL3.GOAL1', true), goal('TUTORIAL_DIALOG.LEVEL3.GOAL2', true), goal('TUTORIAL_DIALOG.LEVEL3.GOAL3', true)]);
  }

  /** 0x7bb28. */
  protected override needsRepair(): void {
    if (this.told.repair) return;
    this.hint('HINTS.HANGAR_0', 'HINTS.NEED_TO_BE_REPAIRED');
    this.told.repair = true;
  }

  /** 0x7bb64. */
  protected override needsFuel(): void {
    if (this.told.fuel) return;
    this.hint('HINTS.GAS_STATION_0', 'HINTS.NEED_TO_BE_FUELED');
    this.told.fuel = true;
  }

  /** 0x7bba0. */
  protected override needsLuggage(): void {
    if (this.told.luggage) return;
    this.hint('HINTS.LUGGAGE_0', 'HINTS.NEED_TO_BE_LOADED_WITH_LUGGAGE');
    this.told.luggage = true;
  }

  /** 0x7bbdc, 0x7bc00, 0x7bc24. */
  protected override repaired(): void {
    this.countUp(this.goals[0]!);
  }

  protected override fueled(): void {
    this.countUp(this.goals[1]!);
  }

  protected override luggageLoaded(): void {
    this.countUp(this.goals[2]!);
  }
}

/** 0x7ad18: the tutorial of a day. */
export function tutorialFor(day: number): Tutorial {
  if (day === 1) return new BasicSequenceTutorial();
  if (day === 2) return new CombosTutorial();
  if (day === 3) return new ExtrasTutorial();
  throw new Error(`The tutorial has no day ${day}`);
}
