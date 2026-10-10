import { parcelMarks, parcelPose } from '../src/game/view/luggageView';
import { dirtAlpha, rollerPose, splashPose, starPose, washElapsed, waterPose } from '../src/game/view/washView';
import { describe, expect, it } from 'vitest';
import { paletteColor } from '../src/game/palette';
import { energyBar, moodFor, orientationFor, speechPlace, thoughtPlace, nagFlash } from '../src/game/planeView';
import { markerImage } from '../src/game/worldMap';
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
import { glintSlide } from '../src/game/view/waterEffects';

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
});

