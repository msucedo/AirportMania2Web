import { planeInfoRows, planeTrophy } from '../src/game/view/planeInfoDialog';
import { noticePose, noticeStart, noticeStep } from '../src/game/view/awardNotice';
import { describe, expect, it } from 'vitest';
import { parseAwardsTable } from '../src/data/awards';
import type { XmlNode } from '../src/data/xml';
import table from '../src/data/generated/data/descriptors/awards_room_descriptor_table.json';
import { AWARD, awardCount, awardKind, awardSound, awardText, awardsThatFollow, levelEndEvents, medalLevel, takeAward, type AwardsData, type LevelStanding } from '../src/game/awards';
import { awardImages } from '../src/game/awardsRoom';

describe('awards', () => {
  it('knows how each award takes its events', () => {
    expect(awardKind(AWARD.DIPLOMA)).toBe(0);
    expect(awardKind(7)).toBe(0);
    expect(awardKind(AWARD.GAME_FINISHED)).toBe(0);
    expect(awardKind(AWARD.STINGY_MANIAC)).toBe(1);
    expect(awardKind(AWARD.FLYING_TIME)).toBe(3);
    expect([21, 22, 23, 26, 28, 32].map(awardKind)).toEqual([2, 2, 2, 2, 2, 2]);
    expect([24, 25, 29, 33].map(awardKind)).toEqual([3, 3, 3, 3]);
    expect([27, 30, 31].map(awardKind)).toEqual([1, 1, 1]);
  });

  it('gives a plane trophy once only', () => {
    const data: AwardsData = {};
    expect(takeAward(data, 3, 0, 1, 1)).toBe(true);
    expect(takeAward(data, 3, 0, 2, 4)).toBe(false);
    expect(data[3]!.earned).toBe(true);
  });

  it('counts a per-level medal once for each level of each stage', () => {
    const data: AwardsData = {};
    expect(takeAward(data, AWARD.BABY_DELIVERY_ASSISTANCE, 0, 2, 3)).toBe(true);
    expect(takeAward(data, AWARD.BABY_DELIVERY_ASSISTANCE, 0, 2, 3)).toBe(false);
    expect(medalLevel(data, AWARD.BABY_DELIVERY_ASSISTANCE)).toBe(0);
    expect(takeAward(data, AWARD.BABY_DELIVERY_ASSISTANCE, 0, 2, 4)).toBe(true);
    expect(takeAward(data, AWARD.BABY_DELIVERY_ASSISTANCE, 0, 3, 3)).toBe(true);
    expect(awardCount(data, AWARD.BABY_DELIVERY_ASSISTANCE)).toBe(3);
    // Three levels make it silver; six, gold.
    expect(medalLevel(data, AWARD.BABY_DELIVERY_ASSISTANCE)).toBe(1);
    for (let level = 1; level <= 3; level++) takeAward(data, AWARD.BABY_DELIVERY_ASSISTANCE, 0, 5, level);
    expect(medalLevel(data, AWARD.BABY_DELIVERY_ASSISTANCE)).toBe(2);
  });

  it('counts a per-stage medal once for each stage', () => {
    const data: AwardsData = {};
    expect(medalLevel(data, AWARD.FRIENDLY_SKIES)).toBe(-1);
    expect(takeAward(data, AWARD.FRIENDLY_SKIES, 0, 1, 6)).toBe(true);
    expect(takeAward(data, AWARD.FRIENDLY_SKIES, 0, 1, 2)).toBe(false);
    for (let stage = 2; stage <= 4; stage++) expect(takeAward(data, AWARD.FRIENDLY_SKIES, 0, stage, 1)).toBe(true);
    expect(medalLevel(data, AWARD.FRIENDLY_SKIES)).toBe(1);
  });

  it('keeps the best value of a medal that is measured', () => {
    const data: AwardsData = {};
    expect(takeAward(data, AWARD.SUPER_RUNWAY_COORDINATOR, 4, 1, 1)).toBe(true);
    expect(medalLevel(data, AWARD.SUPER_RUNWAY_COORDINATOR)).toBe(0);
    expect(takeAward(data, AWARD.SUPER_RUNWAY_COORDINATOR, 4, 1, 2)).toBe(false);
    expect(takeAward(data, AWARD.SUPER_RUNWAY_COORDINATOR, 3, 1, 2)).toBe(false);
    expect(takeAward(data, AWARD.SUPER_RUNWAY_COORDINATOR, 11, 1, 2)).toBe(true);
    expect(awardCount(data, AWARD.SUPER_RUNWAY_COORDINATOR)).toBe(11);
    expect(medalLevel(data, AWARD.SUPER_RUNWAY_COORDINATOR)).toBe(1);
    takeAward(data, AWARD.SUPER_RUNWAY_COORDINATOR, 15, 3, 1);
    expect(medalLevel(data, AWARD.SUPER_RUNWAY_COORDINATOR)).toBe(2);
  });

  it('gives Perfect Play for Perfect Service in every stage and Gold Master for every medal in gold', () => {
    const data: AwardsData = {};
    for (let stage = 1; stage <= 9; stage++) takeAward(data, AWARD.PERFECT_SERVICE, 0, stage, 1);
    expect(awardsThatFollow(data, 10)).toEqual([]);
    takeAward(data, AWARD.PERFECT_SERVICE, 0, 10, 1);
    expect(awardsThatFollow(data, 10)).toEqual([AWARD.PERFECT_PLAY]);
    for (let id = 21; id <= 33; id++) {
      for (let stage = 1; stage <= 10; stage++) for (let level = 1; level <= 6; level++) takeAward(data, id, 1000, stage, level);
    }
    expect(awardsThatFollow(data, 10)).toEqual([AWARD.GOLD_MASTER, AWARD.PERFECT_PLAY]);
  });

  const standing = (tier: number, lost = 0, improvements = 0): LevelStanding => ({ tier, lost, improvements });
  const facts = { planes: 10, lost: 0, earlyArrivals: 10, earlyDepartures: 10, gateCombos: [4, 4] };

  it('looks at the level itself as it ends', () => {
    const levels = [standing(1), standing(0)];
    const at = { stage: 1, level: 1, stages: 10 };
    expect(levelEndEvents(facts, at, levels, {})).toEqual([AWARD.MASTER_MATCHER, AWARD.SMILING_HAPPY_PEOPLE]);
    expect(levelEndEvents({ ...facts, gateCombos: [4, 3] }, at, levels, {})).toEqual([AWARD.SMILING_HAPPY_PEOPLE]);
    expect(levelEndEvents({ ...facts, earlyDepartures: 9 }, at, levels, {})).toEqual([AWARD.MASTER_MATCHER]);
    expect(levelEndEvents({ ...facts, lost: 1, planes: 11 }, at, levels, {})).toEqual([AWARD.MASTER_MATCHER]);
  });

  it('looks at the whole stage once it has all been played', () => {
    const plain = { ...facts, gateCombos: [1], earlyArrivals: 0 };
    const at = { stage: 2, level: 3, stages: 10 };
    expect(levelEndEvents(plain, at, [standing(5), standing(5), standing(5)], {})).toEqual([AWARD.EXCEPTIONAL_SERVICE, AWARD.PERFECT_SERVICE, AWARD.FRIENDLY_SKIES, AWARD.STINGY_MANIAC]);
    expect(levelEndEvents(plain, at, [standing(5), standing(4, 1), standing(4, 0, 2)], {})).toEqual([AWARD.EXCEPTIONAL_SERVICE]);
    expect(levelEndEvents(plain, at, [standing(3), standing(5), standing(5)], {})).toEqual([AWARD.FRIENDLY_SKIES, AWARD.STINGY_MANIAC]);
    // Part way through a stage not yet finished, nothing for the stage.
    expect(levelEndEvents(plain, { ...at, level: 1 }, [standing(5), standing(0), standing(0)], {})).toEqual([]);
    // Replaying a level of a finished stage looks at it again.
    expect(levelEndEvents(plain, { ...at, level: 1 }, [standing(4), standing(4), standing(4, 1)], {})).toEqual([AWARD.EXCEPTIONAL_SERVICE, AWARD.STINGY_MANIAC]);
  });

  it('gives the last trophies as the game is finished', () => {
    const plain = { ...facts, gateCombos: [1], earlyArrivals: 0 };
    const at = { stage: 10, level: 2, stages: 10 };
    const levels = [standing(4, 1, 1), standing(4, 1, 1)];
    expect(levelEndEvents(plain, at, levels, {})).toEqual([AWARD.GAME_FINISHED, AWARD.EXCEPTIONAL_SERVICE]);
    const data: AwardsData = {};
    for (let stage = 1; stage <= 9; stage++) takeAward(data, AWARD.EXCEPTIONAL_SERVICE, 0, stage, 1);
    expect(levelEndEvents(plain, at, levels, data)).toEqual([AWARD.GAME_FINISHED, AWARD.EXCEPTIONAL_SERVICE, AWARD.HEAVENLY_ASSISTANCE]);
    // Not before the last level of the last stage.
    expect(levelEndEvents(plain, { ...at, stage: 9 }, levels, data)).toEqual([AWARD.EXCEPTIONAL_SERVICE]);
  });

  it('announces each award with its own sound and text', () => {
    expect(awardSound(7)).toBe('SOUNDS.AWARD_NEW_PLANE');
    expect(awardSound(AWARD.BABY_DELIVERY_ASSISTANCE)).toBe('SOUNDS.AWARD_BABY_CRY');
    expect(awardSound(AWARD.WASHER_DASHER)).toBe('SOUNDS.AWARD_GENERIC');
    expect(awardSound(AWARD.GAME_FINISHED)).toBe('SOUNDS.AWARD_FINISH_ALL_LEVELS');
    expect(awardSound(AWARD.DIPLOMA)).toBe('SOUNDS.AWARD_GENERIC');
    expect(awardText(7)).toBe('AWARDS.PLANE_7');
    expect(awardText(AWARD.STINGY_MANIAC)).toBe('AWARDS.STINGY_MANIAC');
    expect(awardText(AWARD.DIPLOMA)).toBe('AWARDS.DIPLOMA');
  });

  it("places every award of the game's table in the room", () => {
    const places = parseAwardsTable(table as XmlNode[]);
    const of = (kind: string) => places.filter((place) => place.kind === kind);
    expect(of('plane').map((place) => place.id)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(of('medal').map((place) => place.id)).toEqual(Array.from({ length: 13 }, (_, index) => 21 + index));
    // The table shows five of the special trophies; Game Master is not among them.
    expect(of('special').map((place) => place.id).sort()).toEqual([34, 35, 36, 37, 39]);
    expect(places.find((place) => place.id === AWARD.GOLD_MASTER)!.text).toBe('AWARDS.GOLD_MASTER');
    expect(places.find((place) => place.kind === 'diploma')).toMatchObject({ id: 0, x: 416, y: 104 });
    expect(places.find((place) => place.kind === 'pig')).toMatchObject({ id: 40, x: 130, y: 280 });
    expect(places.find((place) => place.kind === 'clock')!.id).toBe(41);
    // Every medal's text is the one its id stands for.
    for (const place of of('medal')) expect(place.text).toBe(awardText(place.id));
    expect(awardImages(of('medal')[3]!)).toEqual({ tail: 'AWARDS_ROOM.MEDALS.TAILS.3', silhouette: 'AWARDS_ROOM.MEDALS.SILHOUETTE_1', icon: 'AWARDS_ROOM.MEDALS.ICONS.3' });
    expect(awardImages(of('plane')[11]!)).toEqual({ picture: 'AWARDS_ROOM.PLANES_TROPHIES.12' });
  });

  it('brings the notice in a fifth of a second, keeps it four and sends it away in a fifth', () => {
    let state = noticeStart();
    expect(noticePose(state)).toEqual({ scale: 1.5, alpha: 0 });
    state = noticeStep(state, 0.1, false)!;
    expect(noticePose(state)).toEqual({ scale: 1.25, alpha: 0.5 });
    state = noticeStep(state, 0.1, false)!;
    expect(state).toEqual({ phase: 'shown', clock: 4 });
    expect(noticePose(state)).toEqual({ scale: 1, alpha: 1 });
    state = noticeStep(state, 3.9, false)!;
    expect(state.phase).toBe('shown');
    state = noticeStep(state, 0.2, false)!;
    expect(state).toEqual({ phase: 'going', clock: 1 });
    state = noticeStep(state, 0.1, false)!;
    expect(noticePose(state)).toEqual({ scale: 0.75, alpha: 0.5 });
    expect(noticeStep(state, 0.1, false)).toBeNull();
    // A touch while it is shown sends it away at once.
    expect(noticeStep({ phase: 'shown', clock: 3 }, 0.01, true)).toEqual({ phase: 'going', clock: 1 });
    expect(noticeStep({ phase: 'coming', clock: 0.2 }, 0.01, true)!.phase).toBe('coming');
  });

  it("lists a plane's figures in its dialog", () => {
    const plane = { type: 3, passengers: 40, patience: 'PATIENCE_VALUES.HIGH', loadingSpeed: 'SPEED_VALUES.FAST', points: { runway: 750, gate: 450 } } as never;
    expect(planeTrophy(3)).toBe('AWARDS_ROOM.PLANES_TROPHIES.3');
    expect(planeInfoRows(plane).map((row) => [row.label.split('.')[1], row.value, row.y])).toEqual([
      ['PASSENGERS', '40', -30],
      ['PATIENCE', 'PATIENCE_VALUES.HIGH', -10],
      ['LOAD_SPEED', 'SPEED_VALUES.FAST', 10],
      ['MAXIMUM_EARNINGS', null, 30],
      ['LANDING_TAKEOFF', '750', 55],
      ['ARRIVAL_DEPARTURE', '450', 80],
    ]);
  });
});

