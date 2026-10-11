import { ULTRA_EFFECT, blur, titleLetter } from '../src/game/view/effectText';
import { dialogOpening } from '../src/game/view/dialog';
import { introAwardPlaces, introPose, introStep, type IntroState } from '../src/game/view/levelIntro';
import { menuShiftStep, numberPop, passingPlanePose, skySpeed, slidePose, slideStep, type SlideState } from '../src/game/mainMenu';
import { beltPose, inRuns } from '../src/game/loadingScreen';
import { publisherFades, publisherGlint, publisherOver, publisherSweeps, studioWindV } from '../src/game/opening';
import { levelAwardPlaces, levelDialogHeight, stageAwardPlaces, stageDialogLayout } from '../src/game/view/mapDialogs';
import { MAP_GLINTS, MAP_STREAKS, streakPose, airborneIconPose, birdPose, cloudBob, glintShow, satellitePose, wakeRow, wakeV } from '../src/game/view/mapDecor';
import { blackPuff, blackPuffAlpha, blackPuffStep, blackSmokeWait } from '../src/game/view/blackSmoke';
import { fireSparkStep, rocket, rocketStep, rocketsFor } from '../src/game/view/fireworks';
import { barSpark, barStar, hangarSpark, sparkPose, tierBurst, tierTextPose } from '../src/game/view/goalEffects';
import { goalBarReach } from '../src/game/view/hud';
import { fanPose, fanRays, comboStar, comboStarPose, starThrows } from '../src/game/view/comboExplosion';
import { hsv, remarkRings, rgb, stopSpotRemark } from '../src/game/view/placeRemark';
import { floatingAlpha, floatingPush, floatingStretch } from '../src/game/view/floatingText';
import { puffPeriod, smokeAlpha, smokes } from '../src/game/view/smokeTail';
import { PlaneState } from '../src/game/sim/rules';
import { deicerPose } from '../src/game/view/iceView';
import { parcelMarks, parcelPose } from '../src/game/view/luggageView';
import { dirtAlpha, rollerPose, splashPose, starPose, washElapsed, waterPose } from '../src/game/view/washView';
import { describe, expect, it } from 'vitest';
import { paletteColor } from '../src/game/palette';
import { energyBar, moodFor, orientationFor, speechPlace, thoughtPlace, nagFlash } from '../src/game/planeView';
import { listLimit, listRest, listRowAt, listRowY, listSettle } from '../src/game/view/improvementsDialog';
import { barWidth, cloudStart, sunPose, veilStep } from '../src/game/sceneLoading';
import { gateLabelStrength } from '../src/game/view/gateView';
import { coast, dragSpeed, markerImage } from '../src/game/worldMap';
import { reportPercent } from '../src/game/view/finalReport';
import { clockDigits, goalBarFraction } from '../src/game/view/hud';
import { comboArrows, usingArrow } from '../src/game/view/runwayView';
import { cloudX, skyColorsAt, skyPhaseAt } from '../src/game/view/sky';
import { ringInterval } from '../src/game/view/waterEffects';
import { brushPose, patchAlpha, puffAlpha } from '../src/game/view/sandView';
import { markPop, panelTop } from '../src/game/view/tutorialViews';
import { cloudBandPose, movingImageX, propellerAngle } from '../src/game/view/scenery/airborne';
import { batFrame, batOffset, fogPatchPose, scaryCloudPose } from '../src/game/view/scenery/monsters';
import { marsSkyPoints, marsSkyTexture } from '../src/game/view/scenery/mars';
import { auroraPoints, starThrob } from '../src/game/view/scenery/night';
import { flakeAlpha, loopClock, sleighPoses } from '../src/game/view/scenery/northPole';
import { backdropOf, isScenery } from '../src/game/stages/layout';
import { NORTH_POLE } from '../src/game/stages/northPole';
import { flagLean, horizonPose, horizonX } from '../src/game/view/scenery/simple';
import { spaceDrift, spaceStars, spaceTwinkle, starGenerator } from '../src/game/view/scenery/space';
import { glintSlide, shoreSlide } from '../src/game/view/waterEffects';

describe('plane drawing rules', () => {
  it('picks the perspective and mirroring from the heading', () => {
    expect(orientationFor(0)).toEqual({ perspective: 0, flipped: false });
    expect(orientationFor(180)).toEqual({ perspective: 0, flipped: true });
    expect(orientationFor(90)).toEqual({ perspective: 1, flipped: false });
    expect(orientationFor(270)).toEqual({ perspective: 2, flipped: false });
    expect(orientationFor(200)).toEqual({ perspective: 0, flipped: true });
  });

  it('shows eight energy frames and flickers the top one in the lower half of each', () => {
    expect(energyBar(1.3)).toEqual({ solid: 7, flicker: null, flickerAlpha: 0 });
    expect(energyBar(0.95)).toEqual({ solid: 7, flicker: null, flickerAlpha: 0 });
    const fading = energyBar(0.9)!;
    expect(fading.solid).toBe(6);
    expect(fading.flicker).toBe(7);
    expect(fading.flickerAlpha).toBeGreaterThanOrEqual(0);
    expect(fading.flickerAlpha).toBeLessThanOrEqual(1);
    expect(energyBar(0.05)).toMatchObject({ solid: 0, flicker: 0 });
    expect(energyBar(0)).toBeNull();
    expect(energyBar(-0.2)).toBeNull();
  });

  it('turns the mood sour as energy drops', () => {
    expect(moodFor(1)).toEqual({ mouth: 0, browAngle: 0 });
    expect(moodFor(0.6)).toEqual({ mouth: 1, browAngle: 0 });
    expect(moodFor(0.4)).toEqual({ mouth: 2, browAngle: 10 });
    expect(moodFor(0.1)).toEqual({ mouth: 4, browAngle: 25 });
  });

  it('maps level colour names onto the original table', () => {
    expect(paletteColor('BLUE')).toEqual({ main: 0x70a9ff, shade: 0x5d9eff });
    expect(paletteColor('VIOLET').main).toBe(0xc789f3);
    expect(paletteColor(null).main).toBe(0xc8c8c8);
    expect(paletteColor('NOPE')).toEqual(paletteColor(null));
  });
});

describe('sky', () => {
  it('runs from day through sunset to night and back in 220 seconds', () => {
    expect(skyPhaseAt(0)).toEqual({ phase: 0, blend: 0 });
    expect(skyPhaseAt(30)).toEqual({ phase: 0, blend: 0.5 });
    expect(skyPhaseAt(65)).toEqual({ phase: 1, blend: 0.5 });
    expect(skyPhaseAt(110).phase).toBe(4);
    expect(skyPhaseAt(220)).toEqual({ phase: 0, blend: 0 });
    expect(skyColorsAt(0)).toEqual(['rgb(153,229,255)', 'rgb(178,229,255)', 'rgb(229,229,255)']);
    expect(skyColorsAt(110)[0]).toBe('rgb(0,0,0)');
  });

  it('drifts each cloud across during half of its loop', () => {
    expect(cloudX(0, 0.3)).toBeCloseTo(290);
    expect(cloudX(10, 0.3)).toBeCloseTo(340);
    expect(cloudX(0, 1)).toBeNull();
    expect(cloudX(260, 1)).toBeCloseTo(-100);
  });
});

describe('water', () => {
  it('spaces a plane\'s rings by its speed', () => {
    expect(ringInterval(0, 1)).toBeCloseTo(1);
    expect(ringInterval(0, 0)).toBeCloseTo(0.7);
    expect(ringInterval(50, 1)).toBeCloseTo(0.1);
    expect(ringInterval(200, 1)).toBeCloseTo(0.07);
  });
});

describe('runway combo arrows', () => {
  it('shows up to one arrow per second of combo time, falling with the square of the timer', () => {
    expect(comboArrows(1, 5)).toBe(5);
    expect(comboArrows(0.5, 5)).toBeCloseTo(1.25);
    expect(comboArrows(0, 5)).toBe(0);
  });
});

describe('world map markers', () => {
  it('shows a level as not reached, next to play, or by the score tier it was passed with', () => {
    expect(markerImage(0, false)).toBe(0);
    expect(markerImage(0, true)).toBe(1);
    expect(markerImage(1, false)).toBe(2);
    expect(markerImage(5, false)).toBe(6);
  });
});

describe('final report', () => {
  it('grows each punctuality bar to the whole percentage of the level\'s planes', () => {
    expect(reportPercent(5, 5)).toBe(100);
    expect(reportPercent(1, 3)).toBe(33);
    expect(reportPercent(0, 7)).toBe(0);
    expect(reportPercent(2, 0)).toBe(0);
  });
});

describe('plane balloons', () => {
  const bubble = { x: 45, y: 45 };
  it('hangs the speech balloon up and to the right by default, mirrored for the other corners', () => {
    expect(speechPlace(bubble, 5, 1, 1)).toEqual({ x: 45, y: -73, flipX: false, flipY: false });
    expect(speechPlace(bubble, 5, 0, 1).x).toBe(50);
    expect(speechPlace(bubble, 5, 1, 0)).toEqual({ x: -35, y: -73, flipX: true, flipY: false });
    expect(speechPlace(bubble, 5, 1, 3)).toEqual({ x: 45, y: 22, flipX: false, flipY: true });
  });

  it('puts the thought cloud 50 px aside, above or below', () => {
    expect(thoughtPlace(1)).toEqual({ x: 50, y: -80, flipX: false, flipY: false });
    expect(thoughtPlace(2)).toEqual({ x: -50, y: 15, flipX: true, flipY: true });
  });
});

describe('in-game bar', () => {
  const goals = { number: 1, extraPlane: false, fogs: 0, ices: 0, sands: 0, goal: 1000, expert: 2000, master: 3000, supreme: 4000, perfect: 5000 };
  it('fills the goal bar tier by tier, quickly at first within each', () => {
    expect(goalBarFraction(0, goals)).toBe(0);
    expect(goalBarFraction(1000, goals)).toBeCloseTo(0.2);
    expect(goalBarFraction(500, goals)).toBeCloseTo(0.2 * Math.pow(0.5, 0.6));
    expect(goalBarFraction(1500, goals)).toBeCloseTo(0.2 + 0.2 * Math.pow(0.5, 0.6));
    expect(goalBarFraction(9000, goals)).toBe(1);
    expect(goalBarFraction(-300, goals)).toBe(0);
  });

  it('reads the time left as three base-9 digits', () => {
    expect(clockDigits(1)).toEqual([9, 9, 9]);
    expect(clockDigits(0.5)).toEqual([4, 4, 4]);
    expect(clockDigits(1 / 9)).toEqual([1, 0, 0]);
    expect(clockDigits(0)).toEqual([0, 0, 0]);
  });
});

describe('runway in-use arrows', () => {
  it('run towards the node for a landing and away from it for a take-off', () => {
    expect(usingArrow(0, true)).toEqual({ along: 260, opacity: 0 });
    expect(usingArrow(0.5, true)).toEqual({ along: 150, opacity: 1 });
    expect(usingArrow(1, true).along).toBe(40);
    expect(usingArrow(0, false).along).toBe(40);
    expect(usingArrow(1, false).along).toBe(260);
    // They fade over the first and last tenth of the run.
    expect(usingArrow(0.05, false).opacity).toBeCloseTo(0.5, 5);
    expect(usingArrow(0.95, false).opacity).toBeCloseTo(0.5, 5);
  });
});

describe('speech balloon flash', () => {
  it('runs for half a second shortly after the plane speaks', () => {
    expect(nagFlash(2)).toBeNull();
    expect(nagFlash(1.8)).toBeNull();
    expect(nagFlash(1.3)).toBeNull();
    const start = nagFlash(1.79)!;
    expect(start.scale).toBeCloseTo(1.49, 5);
    expect(start.opacity).toBeCloseTo(0.98, 5);
    const end = nagFlash(1.31)!;
    expect(end.scale).toBeCloseTo(1.01, 5);
    expect(end.opacity).toBeCloseTo(0.02, 5);
  });
});

describe('runway sand', () => {
  it('lays its six patches one after another from the left, and solid once it has settled', () => {
    const row = (fade: number) => [0, 1, 2, 3, 4, 5].map((index) => +patchAlpha(index, fade).toFixed(2));
    expect(row(0.25)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(row(0.5)).toEqual([1, 0.67, 0.33, 0, 0, 0]);
    expect(row(0.75)).toEqual([1, 1, 1, 1, 0.67, 0.33]);
    expect(row(1)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(row(1.5)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('sweeps the brush from the right end to the left, dropping onto the runway as it appears', () => {
    expect(brushPose(0)).toEqual({ x: 180, y: -25, alpha: 0, frame: 0 });
    expect(brushPose(0.5)).toEqual({ x: 85, y: -5, alpha: 1, frame: 0 });
    expect(brushPose(0.26).frame).toBe(Math.trunc(0.26 * 96) % 8);
    // It stops turning at the end and fades out over the last twentieth of the way.
    expect(brushPose(0.95).frame).toBe(2);
    expect(brushPose(0.975).alpha).toBeCloseTo(0.5, 5);
    expect(brushPose(1).x).toBe(-10);
  });

  it('shows a puff only once it has less than a second left, and fades it at the end', () => {
    expect(puffAlpha(1.1)).toBe(0);
    expect(puffAlpha(0.9)).toBeCloseTo(0.5, 5);
    expect(puffAlpha(0.7)).toBe(1);
    expect(puffAlpha(0.25)).toBeCloseTo(0.5, 5);
  });
});

describe('tutorial goals panel', () => {
  it('slides up from under the screen by the square of how far it has come', () => {
    // Four goals are 88 px tall: it ends 128 px above y 350.
    expect([0, 0.5, 1].map((shown) => panelTop(88, shown))).toEqual([350, 318, 222]);
  });

  it('pops a goal\'s mark in over a second, overshooting on the way', () => {
    expect(markPop(0)).toBe(0);
    expect(markPop(0.125)).toBeCloseTo(0.125 + 2 * 0.125 * 0.875, 5);
    expect(markPop(0.375)).toBeCloseTo(0.375, 5);
    expect(markPop(1)).toBe(1);
    expect(markPop(3)).toBe(1);
  });
});

describe('scenery', () => {
  it('sways the tutorial flag once every five seconds', () => {
    expect(flagLean(0)).toBeCloseTo(0, 6);
    expect(flagLean(1.25)).toBeCloseTo(0.05, 6);
    expect(flagLean(3.75)).toBeCloseTo(-0.05, 6);
    expect(flagLean(6.25)).toBeCloseTo(0.05, 6);
  });

  it('brings an island along the horizon from the right, tilted and sunk with its curve', () => {
    // A loop of 400 s at 8 px a second: on screen only for its last seventy seconds or so.
    expect(horizonX(0, 400, 8)).toBe(3100);
    expect(horizonX(400, 400, 8)).toBe(-100);
    expect(horizonPose(horizonX(300, 400, 8), 37)).toBeNull();
    expect(horizonPose(240, 37)).toEqual({ x: 240, y: 37, angle: 3 });
    expect(horizonPose(0, 37)).toEqual({ x: 0, y: 44, angle: -3 });
    expect(horizonPose(-40, 37)).toBeNull();
    expect(horizonPose(520, 37)).toBeNull();
  });

  it('slides a glint of a moving sea by how far it is along its beat', () => {
    expect(glintSlide(0, 0)).toBe(-0.5);
    expect(glintSlide(1, 0)).toBe(0);
    expect(glintSlide(1, 0.75)).toBeCloseTo(-0.25, 6);
    expect(glintSlide(3, 0.25)).toBeCloseTo(0.25, 6);
  });

  it('throbs a star between six and ten tenths of its size', () => {
    expect(starThrob(0, 0)).toBeCloseTo(0.8, 6);
    expect(starThrob(Math.PI / 8, 0)).toBeCloseTo(1, 6);
    expect(starThrob(0, (3 * Math.PI) / 8)).toBeCloseTo(0.6, 6);
  });

  it('lays the aurora as an arch whose lower edge ripples', () => {
    const points = auroraPoints(0);
    expect(points).toHaveLength(300);
    // Each pair shares its x; the strip runs from about 0 to about 800.
    for (let pair = 0; pair < 75; pair++) expect(points[4 * pair]).toBe(points[4 * pair + 2]);
    expect(Math.abs(points[0]!)).toBeLessThan(3);
    expect(Math.abs(points[296]! - 800)).toBeLessThan(3);
    // The top edge is 80·n² − 20, n going from −1 at one end to 1 at the other.
    const middle = 4 * 37;
    const n = (points[middle]! - 400) / 400;
    expect(points[middle + 1]).toBeCloseTo(80 * n * n - 20, 4);
    // The lower edge hangs near 120 in the middle, give or take the three waves.
    expect(Math.abs(points[middle + 3]! - 120)).toBeLessThan(8);
    // Its clock starts again every 495 seconds, and the three waves come round every 100.
    expect(Array.from(auroraPoints(495))).toEqual(Array.from(points));
    expect(auroraPoints(100)[middle + 3]).toBeCloseTo(points[middle + 3]!, 3);
    expect(Array.from(auroraPoints(30))).not.toEqual(Array.from(points));
  });

  it('shows a moving image only for the first part of each loop', () => {
    // A mountain of the Airborne stage: 250 s loop, 45 s in view, 6.5 px a second leftwards.
    const mountain = { x: 500, loop: 250, span: 45, speed: -6.5, offset: 50 };
    expect(movingImageX(0, mountain)).toBeNull();
    // Its clock is 50 s ahead, so it comes round just after 200 s (not at 200 exactly: the
    // clock starts again only once it has passed the loop).
    expect(movingImageX(200, mountain)).toBeNull();
    expect(movingImageX(201, mountain)).toBe(493.5);
    expect(movingImageX(220, mountain)).toBe(370);
    expect(movingImageX(244.9, mountain)).toBeCloseTo(500 - 6.5 * 44.9, 4);
    expect(movingImageX(245, mountain)).toBeNull();
    // A cloud of the sky: from 100 px left of the screen, in view for half its loop.
    const cloud = { x: -100, loop: 520, span: 260, speed: 5, offset: 0 };
    expect(movingImageX(0, cloud)).toBe(-100);
    expect(movingImageX(100, cloud)).toBe(400);
    expect(movingImageX(230, cloud)).toBeNull();
  });

  it('slides a band of cloud one image width a period, bobbing more the faster it is', () => {
    expect(cloudBandPose(0, 50, 240)).toEqual({ slide: 0, sink: 2.4 });
    expect(cloudBandPose(25, 50, 240).slide).toBe(120);
    expect(cloudBandPose(50, 50, 240).slide).toBe(0);
    // A quarter of the bob's 10π seconds on, it is at its lowest: twice the resting sink.
    expect(cloudBandPose(2.5 * Math.PI, 12, 240).sink).toBeCloseTo(20, 5);
    expect(cloudBandPose(7.5 * Math.PI, 12, 240).sink).toBeCloseTo(0, 5);
  });

  it('turns a propeller ten times a second', () => {
    expect(propellerAngle(0)).toBe(0);
    expect(propellerAngle(0.025)).toBeCloseTo(90, 5);
    expect(propellerAngle(0.1)).toBeCloseTo(0, 5);
  });

  it('drifts a scary cloud round between −300 and 880, swelling as it goes', () => {
    expect(scaryCloudPose(0, 100, 15)).toEqual({ x: 100, scaleX: 1, scaleY: 1.06 });
    expect(scaryCloudPose(10, 100, 15).x).toBeCloseTo(250, 4);
    // Past 880 it comes back in at the left. One moving left is worked out as a move right of
    // the rest of a 1190 px turn and brought back by 1180, which leaves it 10 px on.
    expect(scaryCloudPose(60, 100, 15).x).toBeCloseTo(100 + 900 - 1180, 4);
    expect(scaryCloudPose(50, 400, -8).x).toBeCloseTo(10, 4);
    for (const t of [0, 13, 77, 150, 400]) {
      const pose = scaryCloudPose(t, 700, -12);
      expect(pose.x).toBeGreaterThanOrEqual(-300);
      expect(pose.x).toBeLessThanOrEqual(880);
      expect(Math.abs(pose.scaleX - 1)).toBeLessThanOrEqual(0.04);
    }
  });

  it('slides a patch of fog for part of its loop, fading in and out over two seconds', () => {
    expect(fogPatchPose(0, 13, -2.5)).toEqual({ dx: -0, alpha: 0 });
    expect(fogPatchPose(1, 13, -2.5)).toEqual({ dx: -2.5, alpha: 0.5 });
    expect(fogPatchPose(6, 13, -2.5)).toEqual({ dx: -15, alpha: 1 });
    expect(fogPatchPose(12, 13, -2.5)).toEqual({ dx: -30, alpha: 0.5 });
    expect(fogPatchPose(13, 13, -2.5)).toBeNull();
  });

  it('swoops a bat round a wide arc and beats its wings twice a second', () => {
    // From above the point it turns about, out to the left, and down below it.
    expect(batOffset(0, 0).y).toBeCloseTo(-120 + 1.1 * (1 + Math.cos(0.13) + Math.cos(0.15)), 4);
    const left = batOffset(10 / 6, 0);
    expect(left.x).toBeLessThan(-140);
    expect(Math.abs(left.y)).toBeLessThan(4);
    expect(batOffset(10 / 3, 0).y).toBeGreaterThan(115);
    expect([0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t) => batFrame(t, 0))).toEqual([0, 1, 2, 3, 4, 0]);
    expect(batFrame(0, 5)).toBe(5);
    expect(batFrame(0.1, 5)).toBe(0);
  });

  it('brings Santa across on an arch, the sleigh behind five reindeer', () => {
    expect(loopClock(0, 380, 4.58405)).toBeCloseTo(4.58405, 5);
    expect(loopClock(379, 380, 4.58405)).toBeCloseTo(3.58405, 4);
    // Out of sight for most of the loop.
    expect(sleighPoses(30, { x: -100, y: 50 }, 50)).toBeNull();
    const poses = sleighPoses(10, { x: -100, y: 50 }, 50)!;
    expect(poses).toHaveLength(6);
    // 18 px apart, the sleigh at the rear at x 400: the top of the arch, 20 px up.
    expect(poses.map((p) => p.x)).toEqual([400, 418, 436, 454, 472, 490]);
    expect(poses[0]!.y).toBeCloseTo(50 - 20 + 3 * Math.sin(2 * Math.PI * 2), 4);
    // Each turned the way the path runs from the one behind; the sleigh half as much as the first reindeer.
    expect(poses[1]!.angle).toBeCloseTo((Math.atan2(poses[1]!.y - poses[0]!.y, 18) * 180) / Math.PI, 5);
    expect(poses[0]!.angle).toBeCloseTo(poses[1]!.angle / 2, 5);
  });

  it('fades a snow flake in and out at the ends of its fall', () => {
    expect([30, 36, 42, 90, 144, 150].map((y) => +flakeAlpha(y, 30, 150).toFixed(2))).toEqual([0, 0.5, 1, 1, 0.5, 0]);
  });

  it('gives the North Pole an overcast sky with snow on odd levels and a clear one on even', () => {
    const kinds = (level: number) => backdropOf(NORTH_POLE, level).layers.map((entry) => (isScenery(entry) ? entry.scenery : entry.resource.split('.').pop()));
    expect(backdropOf(NORTH_POLE, 2).sky).toBe(70);
    expect(kinds(2)).toEqual(['BACKGROUND_DOWN', 'BACKGROUND_TOP', 'sleigh']);
    expect(backdropOf(NORTH_POLE, 3).sky).toBeNull();
    expect(kinds(3)).toEqual(['COVERED_SKY', 'BACKGROUND_DOWN', 'moving', 'moving', 'moving', 'moving', 'moving', 'moving', 'BACKGROUND_TOP', 'sleigh', 'snow', 'snow', 'snow', 'snow', 'snow']);
    // Santa starts each level somewhere else in his loop.
    const offset = (level: number) => backdropOf(NORTH_POLE, level).layers.flatMap((entry) => (isScenery(entry) && entry.scenery === 'sleigh' ? [entry.offset] : []))[0];
    expect([1, 2, 8].map(offset)).toEqual([4.58405, 9.53402, 6.64197]);
  });

  it('makes the same field of stars for the Moon every time', () => {
    const a = starGenerator(19088814);
    const b = starGenerator(19088814);
    const first = [a(), a(), a(), a()];
    expect([b(), b(), b(), b()]).toEqual(first);
    expect(new Set(first).size).toBe(4);
    for (const value of first) expect(Number.isInteger(value) && value >= 0 && value < 2 ** 32).toBe(true);
    expect(starGenerator(19088815)()).not.toBe(first[0]);

    const stars = spaceStars(70);
    expect(stars).toHaveLength(150);
    expect(spaceStars(70)).toEqual(stars);
    for (const star of stars) {
      expect(star.x).toBeGreaterThanOrEqual(-50);
      expect(star.x).toBeLessThan(500);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThan(600);
      expect(star.size).toBeGreaterThanOrEqual(0.2);
      expect(star.size).toBeLessThan(0.3001);
    }
  });

  it('lifts the field of stars through the sky and brings it back in from below', () => {
    expect(spaceDrift(0, 46, 108, 70)).toEqual({ x: 46, y: 108 });
    // A tenth of the way round: 62 px up and 10 px left.
    const tenth = 1 / 0.03;
    expect(spaceDrift(tenth, 46, 108, 70).x).toBeCloseTo(36, 4);
    expect(spaceDrift(tenth, 46, 108, 70).y).toBeCloseTo(46, 4);
    // Gone 620 px above the strip, it is put back where it will come up again.
    const late = 0.999 / 0.003;
    expect(spaceDrift(late, 46, 60, 70).y).toBeCloseTo(60 - 620 * 0.999 + 620, 3);
    expect(spaceDrift(late, 46, 60, 70).x).toBeCloseTo(46 - 99.9 + 100, 3);
    expect(spaceTwinkle(0, Math.PI / 2)).toBeCloseTo(1, 6);
    expect(spaceTwinkle(0, -Math.PI / 2)).toBeCloseTo(0.6, 6);
  });

  it('lays the sky of Mars over a grid of 30 by 20 points, 480 px wide and as tall as asked', () => {
    const points = marsSkyPoints(70);
    expect(points).toHaveLength(1200);
    expect([points[0], points[1]]).toEqual([0, 0]);
    expect(points[2 * 29]).toBeCloseTo(480, 4);
    expect(points[2 * (19 * 30) + 1]).toBeCloseTo(70, 4);
    expect(points[2 * (19 * 30 + 29)]).toBeCloseTo(480, 4);
  });

  it('slides half the image across the grid and ripples it', () => {
    const uvs = marsSkyTexture(0);
    expect(uvs).toHaveLength(1200);
    for (let k = 0; k < 600; k++) {
      // Half the image across, a little in from its edges; nearly all of it down.
      expect(uvs[2 * k]).toBeGreaterThan(0);
      expect(uvs[2 * k]).toBeLessThan(0.5);
      expect(uvs[2 * k + 1]).toBeGreaterThan(0.03);
      expect(uvs[2 * k + 1]).toBeLessThan(0.97);
    }
    // A column further on is about a 62nd of the image further across; a row down, a 21st lower.
    expect(uvs[2]! - uvs[0]!).toBeCloseTo(0.5 / 31, 2);
    expect(uvs[2 * 30 + 1]! - uvs[1]!).toBeCloseTo(1 / 21, 1);
    // A quarter of the way round (62.5 s) it has slid a quarter of the image; past half way it steps back.
    const quarter = marsSkyTexture(62.5);
    expect(quarter[0]! - uvs[0]!).toBeGreaterThan(0.24);
    expect(quarter[0]! - uvs[0]!).toBeLessThan(0.26);
    const later = marsSkyTexture(187.5);
    expect(Math.abs(later[0]! - quarter[0]!)).toBeLessThan(0.01);
    // It comes round every 250 seconds.
    expect(Array.from(marsSkyTexture(250)).map((v) => +v.toFixed(4))).toEqual(Array.from(uvs).map((v) => +v.toFixed(4)));
  });

  it('runs the rollers of a wash out and back once a second', () => {
    // Not shown until its clock is under six, nor once it has run out.
    expect(rollerPose(6.2)).toBeNull();
    expect(rollerPose(0)).toBeNull();
    // It comes over half a second, still at its place for the first second.
    expect(rollerPose(5.75)).toMatchObject({ slide: 0, alpha: 0.5 });
    expect(rollerPose(5.2)!.slide).toBeCloseTo(0, 5);
    // Then 60 px out at each half second and back at each whole one.
    expect(rollerPose(4.5)!.slide).toBeCloseTo(60, 5);
    expect(rollerPose(4)!.slide).toBeCloseTo(0, 5);
    expect(rollerPose(2.25)!.slide).toBeCloseTo(30, 5);
    expect(rollerPose(0.5)).toMatchObject({ slide: 0, alpha: 1 });
    expect(rollerPose(0.25)!.alpha).toBeCloseTo(0.5, 5);
    // Four frames, ten a second.
    expect([3.0, 3.1, 3.2, 3.3, 3.4].map((clock) => rollerPose(clock + 0.01)!.frame)).toEqual([2, 3, 0, 1, 2]);
  });

  it('shows the water of a wash for five seconds, the stars and splashes for their last one', () => {
    expect(waterPose(5)).toBeNull();
    expect(waterPose(4.5)!.alpha).toBeCloseTo(0.5, 5);
    expect(waterPose(2.5)).toEqual({ frame: 1, alpha: 1 });
    expect(waterPose(0.25)!.alpha).toBeCloseTo(0.25, 5);
    expect(starPose(1.2)).toBeNull();
    expect(starPose(0.5)).toEqual({ scale: 1, alpha: 1 });
    expect(starPose(0.95)!.scale).toBeCloseTo(0.1, 5);
    expect(starPose(0.95)!.alpha).toBeCloseTo(0.5, 5);
    expect(splashPose(1)).toBeNull();
    expect(splashPose(0.5)!.scale).toBeCloseTo(1, 5);
    expect(splashPose(0.5)!.alpha).toBeCloseTo(0.5, 5);
    expect(splashPose(0.1)!.alpha).toBeCloseTo(0.06, 5);
    // Light blue as it starts, white as it ends.
    expect(splashPose(0.999)!.tint >> 16).toBe(155);
    expect(splashPose(0.5)!.tint).toBe((205 << 16) | (250 << 8) | 255);
    expect(splashPose(0.001)!.tint).toBe(0xffffff);
  });

  it('fades the dirt while the plane is washed', () => {
    expect(washElapsed(null)).toBeNull();
    expect(washElapsed(8)).toBe(0);
    expect(washElapsed(6)).toBe(2);
    expect(dirtAlpha(0)).toBe(1);
    // The plane is clean two seconds in, with the dirt at a half.
    expect(dirtAlpha(2)).toBe(0.5);
    expect(dirtAlpha(5)).toBe(0);
  });

  it('throws a parcel along the conveyor every second of loading', () => {
    expect(parcelPose(0, false)).toEqual({ x: 100, y: 0, scale: 1, alpha: 1 });
    expect(parcelPose(2.5, false)).toEqual({ x: 40, y: 0, scale: 1, alpha: 1 });
    // It drops over the last fifth of the second and goes over the last tenth, shrinking.
    const late = parcelPose(3.95, false);
    expect(late.x).toBeCloseTo(-14, 4);
    expect(late.y).toBeCloseTo(9, 4);
    expect(late.alpha).toBeCloseTo(0.5, 4);
    expect(late.scale).toBeCloseTo(0.75, 4);
    // Flipped, it goes the other way.
    expect(parcelPose(0.25, true).x).toBeCloseTo(-70, 4);
  });

  it('piles a mark for each second of loading left', () => {
    expect(parcelMarks(0)).toEqual([]);
    expect(parcelMarks(3)).toEqual([{ y: 0, alpha: 1 }, { y: -10, alpha: 1 }, { y: -20, alpha: 1 }]);
    // The top one fades over the last half of its second.
    const marks = parcelMarks(2.75);
    expect(marks).toHaveLength(3);
    expect(marks[2]!.y).toBe(-20);
    expect(marks[2]!.alpha).toBeCloseTo(0.5, 5);
    expect(parcelMarks(0.4)).toEqual([{ y: 0, alpha: 0 }]);
  });

  it('sweeps the deicer along the runway, rocking, with its air running under it', () => {
    const start = deicerPose(0, 1);
    expect(start).toMatchObject({ x: 170, y: -15, angle: -13, scaleX: 1, scaleY: 1, alpha: 1, air: 20 });
    // It swings between 10 px left of the runway's centre and 170 px right, once every 4π seconds.
    expect(deicerPose(2 * Math.PI, 1).x).toBeCloseTo(-10, 4);
    expect(deicerPose(Math.PI / 10, 1).angle).toBeCloseTo(7, 4);
    // Half way in it is solid already and stretched: wider by nothing, taller by a quarter less.
    const coming = deicerPose(0, 0.5);
    expect(coming.alpha).toBe(1);
    expect(coming.scaleX).toBeCloseTo(1, 5);
    expect(coming.scaleY).toBeCloseTo(0.75, 5);
    expect(deicerPose(0, 0.25).alpha).toBe(0.5);
    // The air's window runs 40 px a second and wraps every 20 px, between 10 and 30.
    expect(deicerPose(0.25, 1).air).toBeCloseTo(10, 4);
    expect(deicerPose(0.375, 1).air).toBeCloseTo(15, 4);
    expect(deicerPose(1.1, 1).air).toBeCloseTo(24, 4);
  });

  it('lets smoke go as a plane touches down and brakes, and as it starts its take-off run', () => {
    const landing = (phase: number, time: number) => ({ approach: { phase, time } as never, state: PlaneState.WAITING, speed: 0 });
    expect(smokes(landing(2, 0.9))).toBe(false);
    expect(smokes(landing(3, 0.5))).toBe(true);
    expect(smokes(landing(4, 0.99))).toBe(true);
    expect(smokes(landing(4, 1))).toBe(false);
    const running = (speed: number) => ({ approach: null, state: PlaneState.TAKING_OFF, speed });
    // At 200 px/s² the first 100 px of the run end at 200 px/s.
    expect(smokes(running(150))).toBe(true);
    expect(smokes(running(200))).toBe(false);
    expect(smokes({ approach: null, state: PlaneState.WAITING, speed: 0 })).toBe(false);
  });

  it('puffs faster the faster the plane goes, each puff whole for the second half of its half second', () => {
    expect(puffPeriod(0)).toBeCloseTo(1 / 20, 6);
    expect(puffPeriod(250)).toBeCloseTo(1 / 45, 6);
    expect(puffPeriod(1e6)).toBe(0.005);
    expect(smokeAlpha(0)).toBe(0);
    expect(smokeAlpha(0.25)).toBe(0.5);
    expect(smokeAlpha(0.5)).toBe(1);
    expect(smokeAlpha(0.99)).toBe(1);
  });

  it('wobbles a floating text as it appears and lets it go over its last second', () => {
    expect(floatingStretch(0)).toEqual({ x: 1, y: 1 });
    const early = floatingStretch(1 / 6);
    expect(early.x).toBeCloseTo(1 + 0.075, 5);
    expect(early.y).toBeCloseTo(1 + 0.15 * Math.sin(0.75 * Math.PI), 5);
    expect(floatingStretch(0.7)).toEqual({ x: 1, y: 1 });
    expect(floatingAlpha(0.2, 1.4)).toBe(1);
    expect(floatingAlpha(0.9, 1.4)).toBeCloseTo(0.5, 5);
  });

  it('pushes up the texts in the way of a new one', () => {
    const at = { x: 100, y: 50 };
    // The newest has risen 4 of the 18 px the new one needs: it and the one under it go up 14.
    expect(floatingPush([{ x: 100, y: 50, offset: 30 }, { x: 102, y: 50, offset: 4 }], at, 18)).toEqual([14, 14]);
    // A text elsewhere stops the pushing.
    expect(floatingPush([{ x: 100, y: 50, offset: 30 }, { x: 200, y: 50, offset: 4 }], at, 18)).toEqual([0, 0]);
    // Nothing to push once the newest is clear.
    expect(floatingPush([{ x: 100, y: 50, offset: 20 }], at, 18)).toEqual([0]);
    expect(floatingPush([], at, 18)).toEqual([]);
  });

  it('flashes a place in hues around the plane colour, spreading as it fades', () => {
    expect(hsv(0xff0000)).toEqual({ h: 0, s: 1, v: 1 });
    expect(hsv(0x808080).s).toBe(0);
    expect(rgb(120, 1, 1)).toBe(0x00ff00);
    expect(rgb(hsv(0x70a9ff).h, hsv(0x70a9ff).s, hsv(0x70a9ff).v)).toBe(0x70a9ff);
    const fresh = remarkRings(1, 150, 100, 0x00ff00);
    expect(fresh).toHaveLength(6);
    expect(fresh.every((ring) => ring.scaleX === 1 && ring.scaleY === 1)).toBe(true);
    // 95, 105 ... 145 degrees: the plane's own hue falls between the third and the fourth.
    expect(fresh[0]!.tint).toBe(rgb(95, 1, 1));
    expect(fresh[5]!.tint).toBe(rgb(145, 1, 1));
    const half = remarkRings(0.5, 150, 100, 0x00ff00);
    expect(half[0]).toMatchObject({ scaleX: 1, scaleY: 1 });
    expect(half[4]!.scaleX).toBeCloseTo(1.2, 5);
    expect(half[4]!.scaleY).toBeCloseTo(1.2, 5);
    // A hue under zero wraps round.
    expect(remarkRings(1, 10, 10, 0xff0000)[0]!.tint).toBe(rgb(335, 1, 1));
    expect(stopSpotRemark('STOPSPOT', false)).toBe('STOPSPOT_REMARK');
    expect(stopSpotRemark('STOPSPOT_VIP', true)).toBe('STOPSPOT_REMARK');
    expect(stopSpotRemark('STOPSPOT_ISLAND_BACK', false)).toBe('STOPSPOT_ISLAND_REMARK');
    expect(stopSpotRemark('STOPSPOT_ISLAND_VIP_BACK', true)).toBe('STOPSPOT_ISLAND_VIP_REMARK');
  });
  it('fans light out behind a combo as the original draws it', () => {
    // What the original's draw hands the renderer for a fan at (200, 150), from running it
    // (tools/re/draw_trace.py 0x692e8): the matrix of rays 0, 1 and 8 at two moments.
    const matrix = (t: number, i: number): number[] => {
      const pose = fanPose(t);
      const ray = fanRays(t)[i]!;
      const turn = (ray.angle * Math.PI) / 180;
      return [
        ray.scaleX * Math.cos(turn) * pose.scaleX,
        ray.scaleX * Math.sin(turn) * pose.scaleY,
        -Math.sin(turn) * pose.scaleX,
        Math.cos(turn) * pose.scaleY,
        200 + ray.x * pose.scaleX,
        150 + ray.y * pose.scaleY,
      ];
    };
    const close = (got: number[], want: number[]): void => got.forEach((value, k) => expect(value).toBeCloseTo(want[k]!, 3));
    close(matrix(0.1, 0), [1.00966, -0.210055, 0.178938, 1.18523, 192.104, 146.63]);
    close(matrix(0.35, 1), [1.79244, -0.16001, 0.133309, 1.49406, 198.95, 150.3]);
    close(matrix(0.35, 8), [1.9492, -0.0357336, 0.0274807, 1.49975, 200, 147]);
    close(matrix(0.9, 6), [1.24452, -0.523146, 0.581273, 1.38279, 203.15, 146.7]);
    expect(fanRays(0).map((ray) => ray.tint & 0xff)).toEqual([255, 221, 187, 238, 204, 255, 221, 187, 238]);
    expect(fanPose(0).alpha).toBe(0);
    expect(fanPose(0.1).alpha).toBe(1);
    expect(fanPose(0.9).alpha).toBeCloseTo(0.2, 6);
  });

  it('throws more stars the higher the combo, and dims them as their opacity runs out', () => {
    expect(starThrows(1)).toEqual([]);
    expect(starThrows(2)).toEqual([{ x: -45, y: -270 }, { x: 45, y: -270 }]);
    expect(starThrows(3)).toHaveLength(4);
    expect(starThrows(4)).toHaveLength(8);
    const numbers = [0.25, 0.75, 1, 0.5, 0, 0.5];
    const star = comboStar(100, 200, -45, -270, () => numbers.shift()!);
    expect(star).toMatchObject({ angle: 90, spin: 90, red: 0.3, green: 0.15, blue: 0, alpha: 3.5 });
    // Opacity 3.5: red 0.3 is over 1 and held there, green 0.15 gives 0.525.
    expect(comboStarPose(star, 0)).toEqual({ x: 100, y: 200, angle: 90, scale: 0.7, tint: (255 << 16) | (133 << 8) });
    const later = comboStarPose(star, 1);
    expect(later).toMatchObject({ x: 55, y: 5, angle: 180, scale: 1 });
    // Opacity 1.5: red 0.45, green 0.225.
    expect(later.tint).toBe((114 << 16) | (57 << 8));
    // From 1.75 s its opacity is under zero: nothing is added.
    expect(comboStarPose(star, 1.9).tint).toBe(0);
  });

  it('throws stars and sparks off the goal bar and shows the tier going down', () => {
    expect(tierBurst(1)).toEqual({ stars: 10, sparks: 13 });
    expect(tierBurst(4)).toEqual({ stars: 40, sparks: 52 });
    const half = (): number => 0.5;
    expect(barStar(half)).toMatchObject({ x: 255, y: 12.5, vx: 0, vy: -50, angle: 180, spin: 0, alpha: 3.5 });
    expect(barSpark(() => 0)).toEqual({ x: 195, y: 10, vx: -60, vy: -0 });
    expect(hangarSpark({ x: 100, y: 200 }, half)).toEqual({ x: 100, y: 175, vx: 0, vy: -100 });
    const spark = { x: 0, y: 0, vx: 10, vy: -100 };
    expect(sparkPose(spark, 0.25)).toEqual({ x: 2.5, y: -25 + 75 / 16, alpha: 1 });
    expect(sparkPose(spark, 0.75).alpha).toBeCloseTo(0.5, 5);
    expect(tierTextPose(0.25)).toEqual({ x: 253, y: 21, scale: 0.625, alpha: 0.5 });
    expect(tierTextPose(1)).toMatchObject({ y: 36, alpha: 1 });
    expect(tierTextPose(2.5).alpha).toBeCloseTo(0.5, 5);
  });

  it('stands the goal bar by the tiers reached and the progress in the next', () => {
    const goals = { goal: 1000, expert: 2000, master: 3000, supreme: 4000, perfect: 5000 } as never;
    expect(goalBarReach(0, 0, goals)).toBe(0);
    expect(goalBarReach(0, 0.5, goals)).toBeCloseTo(0.2 * Math.pow(0.5, 0.6));
    expect(goalBarReach(1, 0, goals)).toBeCloseTo(0.2);
    expect(goalBarReach(5, 0, goals)).toBe(1);
  });

  it('puffs black smoke from a plane that needs the hangar', () => {
    const half = (): number => 0.5;
    expect(blackSmokeWait(half)).toBeCloseTo(1.325, 5);
    const puff = blackPuff({ x: 100, y: 200, vx: 30, vy: 0, facingRight: false }, half);
    expect(puff).toEqual({ x: 100, y: 190, vx: -20, vy: -50, angle: 0, spin: 0, scale: 0.5, clock: 0 });
    expect(blackPuff({ x: 0, y: 0, vx: 30, vy: 0, facingRight: true }, half).vx).toBe(80);
    blackPuffStep(puff, 0.5);
    expect(puff.x).toBeCloseTo(90, 5);
    expect(puff.y).toBeCloseTo(165, 5);
    expect(puff.vx).toBeCloseTo(-20 + 20 * Math.sqrt(0.2), 5);
    expect(puff.scale).toBeCloseTo(0.9, 5);
    expect(blackPuffAlpha(0.125)).toBe(0.5);
    expect(blackPuffAlpha(0.4)).toBe(1);
    expect(blackPuffAlpha(0.75)).toBe(0.5);
  });

  it('sends up rockets that trail sparks and burst into sixty', () => {
    expect([1, 3, 14, 20, 21, 24, 30, 31, 33, 35, 36, 40].map(rocketsFor)).toEqual([1, 2, 5, 6, 2, 3, 5, 6, 3, 5, 6, 2]);
    const half = (): number => 0.5;
    const r = rocket(half);
    expect(r).toMatchObject({ x: 240, y: 300, vx: 0, vy: -225, trail: 0.1 });
    for (let t = 0; t < 1.99; t += 0.01) rocketStep(r, 0.01, half);
    expect(r.burst).toBe(false);
    // Height after two seconds against 100 px/s²: 300 − 450 + 200.
    expect(r.y).toBeCloseTo(50, 0);
    expect(r.sparks.length).toBeGreaterThan(20);
    for (let t = 0; t < 0.05; t += 0.01) rocketStep(r, 0.01, half);
    expect(r.burst).toBe(true);
    expect(r.sparks.filter((spark) => spark.life > 1.5)).toHaveLength(60);
    let alive = true;
    for (let t = 0; t < 3 && alive; t += 0.01) alive = rocketStep(r, 0.01, half);
    expect(alive).toBe(false);
    const spark = { x: 0, y: 0, vx: 10, vy: 0, life: 1 };
    fireSparkStep(spark, 1);
    expect(spark).toMatchObject({ x: 10, y: 30, life: 0 });
    expect(spark.vx).toBeCloseTo(3, 5);
    expect(spark.vy).toBeCloseTo(18, 5);
  });

  it('moves the world map: clouds bob, birds circle, the satellite swings by', () => {
    expect(cloudBob(0, 0.25, 2)).toBeCloseTo(2, 5);
    expect(cloudBob(5, 0.25, 2)).toBeCloseTo(-2, 5);
    expect(cloudBob(12.5, 0, 3.5)).toBeCloseTo(3.5, 5);
    const bird = birdPose(0, 0);
    expect(bird.x).toBeCloseTo(0, 5);
    expect(bird.y).toBeCloseTo(1 + Math.cos(0.13) + Math.cos(0.15) + 30, 5);
    expect(bird.frame).toBe(0);
    expect(birdPose(1.3, 0).frame).toBe(0);
    expect(birdPose(1.2, 0).frame).toBe(10);
    expect(satellitePose(0.75)).toBeNull();
    expect(satellitePose(2)).toBeNull();
    const mid = satellitePose(0.375)!;
    expect(mid.scale).toBeCloseTo(1, 5);
    expect(mid.x).toBeCloseTo(-380 * Math.sin(0.375 * Math.PI), 4);
    expect(mid.y).toBeCloseTo(350 * Math.cos(0.375 * Math.PI), 4);
    expect(mid.angle).toBeCloseTo(-9.375, 5);
    expect(satellitePose(0)).toMatchObject({ y: 350, scale: 0.5, bright: 0 });
    expect(airborneIconPose(2.5).drop).toBeCloseTo(5, 5);
    expect(airborneIconPose(2.5).spin).toBeCloseTo(3600, 5);
    expect(airborneIconPose(12.5).drop).toBeCloseTo(5, 5);
    // The wake's points as the original's constructor leaves them (read off a run of it).
    expect(wakeRow(0).y).toBeCloseTo(-49.5, 5);
    expect(wakeRow(0).alpha).toBe(0.8);
    const second = wakeRow(1);
    expect(second.x[0]).toBeCloseTo(-4.60718, 4);
    expect(second.x[3]).toBeCloseTo(3.89838, 4);
    expect(second.y).toBeCloseTo(-47.842, 3);
    expect(wakeRow(31).x[1]).toBeCloseTo(-8.09017, 4);
    expect(wakeRow(31).alpha).toBe(0);
    expect(wakeV(0, 0)).toBeCloseTo(1 / 3, 6);
    expect(wakeV(2.5, 31)).toBeCloseTo(1 / 6 + 2 / 3, 6);
    expect(MAP_GLINTS.map((patch) => patch.glints.length)).toEqual([8, 17, 16]);
    expect(glintShow(0.5, 0)).toBeCloseTo(0.7, 5);
    expect(glintShow(1.5, 0)).toBeCloseTo(-1.3, 5);
    // A streak, against runs of the original's draw at those clocks.
    expect(MAP_STREAKS.map((streak) => streak.rows.length)).toEqual([6, 5, 9, 9, 4, 9]);
    expect(streakPose(0.9)).toBeNull();
    expect(streakPose(0.45)!.alpha).toBe(1);
    expect(streakPose(0.27)!.alpha).toBeCloseTo(0.2, 5);
    expect(streakPose(0.09)!.alpha).toBe(0);
    expect(streakPose(0.27)!.v(0.36046)).toBeCloseTo(0.23954, 5);
    expect(streakPose(0.63)!.v(0.64761)).toBeCloseTo(0.75239, 5);
  });

  it('lays out the map\'s level dialog', () => {
    expect(levelDialogHeight(false)).toBe(225);
    expect(levelDialogHeight(true)).toBe(250);
    expect(levelAwardPlaces(0)).toEqual([]);
    expect(levelAwardPlaces(1)).toEqual([{ x: 145, y: -10 }]);
    expect(levelAwardPlaces(5)).toEqual([{ x: 105, y: -50 }, { x: 145, y: -50 }, { x: 185, y: -50 }, { x: 125, y: 30 }, { x: 165, y: 30 }]);
    expect(levelAwardPlaces(6)).toHaveLength(6);
    expect(introAwardPlaces(1)).toEqual([{ x: 140, y: 40 }]);
    expect(introAwardPlaces(4)).toEqual([{ x: 120, y: 0 }, { x: 160, y: 0 }, { x: 120, y: 80 }, { x: 160, y: 80 }]);
    expect(introAwardPlaces(0)).toEqual([]);
    const intro: IntroState = { phase: 'coming', clock: 0 };
    expect(introPose(intro)).toEqual({ scale: 0.5, alpha: 0 });
    introStep(intro, 0.25, false);
    expect(introPose(intro)).toEqual({ scale: 0.75, alpha: 0.5 });
    introStep(intro, 0.25, true);
    expect(intro).toEqual({ phase: 'shown', clock: 0 });
    expect(introStep(intro, 5.4, false)).toBe(true);
    expect(intro.phase).toBe('shown');
    introStep(intro, 0.2, false);
    expect(intro).toEqual({ phase: 'going', clock: 1 });
    expect(introStep(intro, 0.25, false)).toBe(true);
    expect(introPose(intro)).toEqual({ scale: 0.75, alpha: 0.5 });
    expect(introStep(intro, 0.3, false)).toBe(false);
    const touched: IntroState = { phase: 'shown', clock: 1 };
    introStep(touched, 0.01, true);
    expect(touched.phase).toBe('going');
    expect(stageAwardPlaces(1)).toEqual([{ x: -110, y: 35 }]);
    expect(stageAwardPlaces(2)).toEqual([{ x: -138, y: 35 }, { x: -82, y: 35 }]);
    expect(stageAwardPlaces(5).map((at) => at.x)).toEqual([-190, -150, -110, -70, -30]);
    expect(stageDialogLayout(false)).toMatchObject({ height: 220, name: -75, description: { top: -40, bottom: 60 }, close: 90 });
    expect(stageDialogLayout(true)).toMatchObject({ height: 260, name: -95, description: { top: -80, bottom: 40 }, cleared: 6, stars: 34, rule: 52, total: 70, close: 110 });
  });

  it('runs the opening screens as the original draws them', () => {
    expect(publisherFades(0.5)).toEqual({ published: 0, seal: 0, logo: 0 });
    expect(publisherFades(2)).toEqual({ published: 0.5, seal: 0.25, logo: 0 });
    expect(publisherFades(4)).toEqual({ published: 0.75, seal: 1, logo: 1 });
    expect(publisherFades(6.25).logo).toBeCloseTo(0.125, 5);
    expect(publisherSweeps(3)).toEqual([]);
    // Against runs of the draw at 3.3 s and 3.8 s.
    const early = publisherSweeps(3.3);
    expect(early).toHaveLength(4);
    expect(early[0]).toMatchObject({ reach: 126, flat: 0.232 });
    expect(early[0]!.turn).toBeCloseTo(-14, 4);
    expect(early[0]!.alpha).toBeCloseTo(1, 4);
    expect(early[1]!.turn).toBeCloseTo(-195, 4);
    expect(early[2]!.turn).toBeCloseTo(-120 / 7, 4);
    expect(early[2]!.alpha).toBeCloseTo(0.714285, 4);
    expect(publisherSweeps(3.8)).toHaveLength(2);
    expect(publisherGlint(3.6)).toBeNull();
    const glint = publisherGlint(3.8)!;
    expect(glint.x).toBeCloseTo(206.384, 2);
    expect(glint.y).toBeCloseTo(89.3262, 2);
    expect(glint.glow).toBeCloseTo(0.5, 4);
    expect(glint.star).toBe(0.5);
    expect(publisherGlint(4.1)!.star).toBe(0.3);
    expect(publisherGlint(3.75)!.star).toBeCloseTo(0.45399, 4);
    expect(publisherGlint(4.45)).toMatchObject({ x: 96, y: 136 });
    expect(publisherOver(0.5, true)).toBe(false);
    expect(publisherOver(0.8, true)).toBe(true);
    expect(publisherOver(6.6, false)).toBe(true);
    expect(studioWindV(0.3, 0.2)).toBeCloseTo(0.6, 6);
  });

  it('closes the loading screen\'s belt as the loading goes', () => {
    const open = beltPose(0);
    expect(open.leftPin).toBe(37);
    expect(open.rightPin).toBe(443);
    expect(open.leftStrap).toEqual([13, 1, -11]);
    expect(open.rightStrap).toEqual([467, 479, 491]);
    const shut = beltPose(1);
    expect(shut.leftPin).toBe(217);
    expect(shut.rightPin).toBe(263);
    expect(shut.leftStrap[0]).toBe(193);
    expect(shut.leftStrap.at(-1)).toBe(-11);
    expect(shut.rightStrap[0]).toBe(287);
    expect(shut.rightStrap.at(-1)).toBe(491);
    expect(inRuns([1, 2, 3, 4, 5], 2)).toEqual([[1, 2, 3], [4, 5]]);
  });

  it('brings the main menu in as the original does', () => {
    expect(menuShiftStep(80, 0.1)).toBeCloseTo(68, 5);
    expect(menuShiftStep(0.02, 0.1)).toBe(0);
    expect(menuShiftStep(80, 0.1, -1)).toBe(80);
    expect(menuShiftStep(80, 0.1, 0.5)).toBeCloseTo(74, 5);
    expect(skySpeed(0)).toBeCloseTo(0.0025, 9);
    expect(skySpeed(1)).toBeCloseTo(0.0045, 9);
    expect(skySpeed(2)).toBeCloseTo(0.0105, 9);
    const title: SlideState = { phase: 'waiting', clock: 0 };
    expect(slidePose(title, -1)).toBeNull();
    expect(slideStep(title, 0.05, 0.1)).toBe(false);
    expect(slideStep(title, 0.06, 0.1)).toBe(true);
    expect(slidePose(title, -1)).toEqual({ dx: -480, lean: 0.3 });
    slideStep(title, 0.1, 0.1);
    expect(slidePose(title, -1)!.dx).toBeCloseTo(-336, 4);
    slideStep(title, 0.3, 0.1);
    expect(title).toEqual({ phase: 'settling', clock: 1 });
    // Against a run of the franchise's update in that state with its clock at 0.6.
    expect(slidePose({ phase: 'settling', clock: 0.6 }, 1)!.lean).toBeCloseTo(0.0337286, 5);
    slideStep(title, 0.6, 0.1);
    expect(title.phase).toBe('still');
    expect(slidePose(title, -1)).toEqual({ dx: 0, lean: 0 });
    expect(numberPop(0)).toBe(0);
    expect(numberPop(1)).toBe(1);
    expect(numberPop(0.1)).toBeGreaterThan(1.2);
    const near = passingPlanePose(0, true, 240);
    expect(near).toMatchObject({ y: -250, scale: 1.5, depth: 2, x: 80 });
    expect(passingPlanePose(0, false, 0)).toMatchObject({ y: 222, depth: 10 });
    expect(passingPlanePose(0, false, 0).scale).toBeCloseTo(0.3, 6);
  });

  it('opens a dialog as runs of the original do', () => {
    expect(dialogOpening(0)).toEqual({ a: 0.5625, c: 0.5625, d: 0, alpha: 0 });
    expect(dialogOpening(0.25)).toEqual({ a: 0.8125, c: 0.45703125, d: 0.203125, alpha: 0.25 });
    expect(dialogOpening(0.5)).toEqual({ a: 0.984375, c: 0.328125, d: 0.4921875, alpha: 0.5 });
    const late = dialogOpening(0.75);
    expect(late.a).toBeCloseTo(1.05469, 5);
    expect(late.c).toBeCloseTo(0.175781, 5);
    expect(late.d).toBeCloseTo(0.791016, 5);
    expect(dialogOpening(1)).toEqual({ a: 1, c: 0, d: 1, alpha: 1 });
  });

  it('renders a title letter the way the engine does', () => {
    // 0x98b78 on one solid point, against runs of the routine itself (95, 74 and 204 of 255).
    const dot = new Float32Array(49);
    dot[24] = 1;
    const once = blur(dot, 7, 7, 1);
    expect(Math.trunc(255 * once[24]!)).toBe(95);
    expect(Math.trunc(255 * once[16]!)).toBe(95);
    expect(once[10]).toBe(0);
    const soft = blur(dot, 7, 7, 0.75);
    expect(Math.round(255 * soft[24]!)).toBe(205);
    expect(Math.trunc(255 * soft[16]!)).toBe(74);
    const wide = blur(dot, 7, 7, 2);
    expect(Math.abs(255 * wide[24]! - 215)).toBeLessThan(3);
    expect(Math.abs(255 * wide[8]! - 39)).toBeLessThan(3);
    expect(Math.abs(255 * wide[17]! - 173)).toBeLessThan(3);
    // A solid 3×3 block in a 9×9 picture.
    const cover = new Float32Array(81);
    for (let y = 3; y < 6; y++) for (let x = 3; x < 6; x++) cover[9 * y + x] = 1;
    const letter = titleLetter(cover, 9, 9, ULTRA_EFFECT);
    const pixel = (x: number, y: number): number[] => [...letter.slice(4 * (9 * y + x), 4 * (9 * y + x) + 4)];
    // Its upper right point has four of the six places covered: the head colour, white, stays white.
    expect(pixel(5, 3)[3]).toBe(1);
    expect(pixel(5, 3)[0]).toBeCloseTo(1, 5);
    // Its lower left point has all six empty: the foot colour lit by 6/9 towards white, then to the power 2.2.
    const foot = 0.85 + (1 - 0.85) * (6 / 9);
    expect(pixel(3, 5)[0]).toBeCloseTo(Math.pow(foot, 2.2), 5);
    // Its lower right point has two of them covered, (3, 6) and the like being outside: also 6/9 here.
    expect(pixel(5, 5)[2]).toBeCloseTo(1, 5);
    // Outside the letter there is only its base and border: partly solid, and dark.
    expect(pixel(2, 4)[3]).toBeGreaterThan(0);
    expect(pixel(2, 4)[3]).toBeLessThan(1);
    expect(pixel(0, 0)[3]).toBeLessThan(0.1);
  });
});

describe('the map\'s scroll', () => {
  it('takes its speed from the drag, within limits', () => {
    expect(dragSpeed(0, 5, 1 / 60)).toBeCloseTo(120);
    expect(dragSpeed(120, 5, 1 / 60)).toBeCloseTo(192);
    expect(dragSpeed(0, 100, 1 / 60)).toBe(480);
    expect(dragSpeed(0, -100, 1 / 60)).toBe(-480);
    expect(dragSpeed(10, 0, 1 / 60)).toBe(0);
  });

  it('runs on, slows to a tenth a second and stops at the ends', () => {
    expect(coast(-50, 100, 1, -540)).toEqual({ x: 0, speed: 0 });
    const free = coast(-300, 200, 0.5, -540);
    expect(free.x).toBeCloseTo(-200);
    expect(free.speed).toBeCloseTo(200 * Math.sqrt(0.1));
    expect(coast(-300.4, 20, 0.5, -540)).toEqual({ x: -290, speed: 0 });
    expect(coast(-530, -100, 1, -540)).toEqual({ x: -540, speed: 0 });
  });
});

describe('the shop\'s list', () => {
  it('rests with its first row at the top and its last at the bottom', () => {
    expect(listRest(-3, 0, 8)).toBe(-1);
    expect(listRowY(0, -1)).toBe(-85);
    expect(listRest(6, 7, 8)).toBeCloseTo(2.9);
    expect(listRowY(7, 2.9)).toBeCloseTo(70);
  });

  it('keeps the chosen row in view', () => {
    expect(listRest(-1, 5, 8)).toBeCloseTo(0.9);
    expect(listRest(2.9, 1, 8)).toBe(0);
    expect(listRest(1.5, 3, 8)).toBe(1.5);
  });

  it('settles, and can be dragged only so far', () => {
    expect(listSettle(1, 0, 1)).toBeCloseTo(0.03);
    expect(listSettle(0.004, 0, 1)).toBe(0);
    expect(listLimit(-9, 8)).toBe(-4.75);
    expect(listLimit(9, 8)).toBe(6.75);
  });

  it('finds the row under a touch', () => {
    expect(listRowAt(-115, -1, 8)).toBe(0);
    expect(listRowAt(-66, -1, 8)).toBe(0);
    expect(listRowAt(-64, -1, 8)).toBe(1);
    expect(listRowAt(110, 2.9, 8)).toBe(7);
    expect(listRowAt(-115, -3, 8)).toBe(0);
  });
});

describe('the scene-loading screen', () => {
  it('turns its sun 7.5 degrees a second and lets it breathe', () => {
    expect(sunPose(2).angle).toBeCloseTo(15);
    expect(sunPose(0.5).scale).toBeCloseTo(1 + 0.025 * Math.sin(2.5));
    expect(sunPose(0).scale).toBe(1);
  });

  it('slides its clouds left, a width at a time', () => {
    expect(cloudStart(0, 15, 256)).toBeCloseTo(0);
    expect(cloudStart(5, 15, 256)).toBeCloseTo(-75);
    expect(cloudStart(20, 15, 256)).toBeCloseTo(-44);
  });

  it('grows its bar from 5 to 100 px and moves its veil in a third of a second', () => {
    expect(barWidth(0)).toBe(5);
    expect(barWidth(1)).toBe(100);
    expect(veilStep(1, 0.1, true)).toBeCloseTo(0.7);
    expect(veilStep(0, 0.1, false)).toBeCloseTo(0.3);
  });
});

describe('a gate\'s label', () => {
  it('shows once the gate and the airport are both past a half', () => {
    expect(gateLabelStrength(0.5, 1)).toBe(0);
    expect(gateLabelStrength(1, 0.5)).toBe(0);
    expect(gateLabelStrength(1, 1)).toBe(1);
    expect(gateLabelStrength(0.75, 1)).toBeCloseTo(0.5);
    expect(gateLabelStrength(1, 0.8)).toBeCloseTo(0.2);
  });
});

describe('the island\'s shore waves', () => {
  it('go round their picture every four seconds', () => {
    expect(shoreSlide(0)).toBe(0);
    expect(shoreSlide(1)).toBeCloseTo(0.25);
    expect(shoreSlide(5)).toBeCloseTo(0.25);
  });
});
