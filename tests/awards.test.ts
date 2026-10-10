import { describe, expect, it } from 'vitest';
import { AWARD, awardCount, awardKind, awardsThatFollow, levelEndEvents, medalLevel, takeAward, type AwardsData, type LevelStanding } from '../src/game/awards';

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
});
