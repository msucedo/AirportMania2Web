import { describe, expect, it } from 'vitest';
import { CreditsRoll } from '../src/game/credits';
import { cloudPose, floaterPose, groundItems, groundPose, letterPose, propellerTurn } from '../src/game/ending';

describe('ending', () => {
  it('brings a floater down from the upper right until its clock reaches 2, then only sways', () => {
    const far = floaterPose(0, 1);
    expect(far.x).toBeCloseTo(240, 4);
    expect(far.y).toBeCloseTo(10 - 2560, 4);
    expect(far.angle).toBeCloseTo(100, 4);
    const there = floaterPose(2, 0.5);
    expect(there.x).toBeCloseTo(5.5 * Math.sin(0.94), 5);
    expect(there.y).toBeCloseTo(5 * Math.cos(1.06), 5);
    expect(there.angle).toBeCloseTo(7 * Math.sin(0.6), 5);
    expect(propellerTurn(0.1)).toBe(500);
  });

  it('shows the ground only near, larger and higher the nearer it is', () => {
    expect(groundPose(10, 120)).toBeNull();
    expect(groundPose(0, 120)).toEqual({ x: 480, y: 320, scale: 2 });
    expect(groundPose(1.5, -120)).toEqual({ x: 180, y: 383, scale: 0.5 });
    expect(cloudPose(10, 0)).toBeNull();
    expect(cloudPose(2, 100)).toEqual({ x: 340, y: 84, scale: 1 });
    // A cloud right at the eye is no larger than twenty times its size.
    expect(cloudPose(0, 0)!.scale).toBe(20);
  });

  it('makes four rings of thirty pairs for the ground', () => {
    const items = groundItems();
    expect(items).toHaveLength(240);
    expect(items[0]).toEqual({ resource: 'FINAL_VICTORY.BUILDINGS.0', side: 120, z: 40, mirrored: false });
    expect(items[1]).toEqual({ resource: 'FINAL_VICTORY.BUILDINGS.3', side: -120, z: 40, mirrored: true });
    expect(items[60]!.resource).toBe('FINAL_VICTORY.CANION.0');
    expect(items[239]).toEqual({ resource: 'FINAL_VICTORY.PALM_TREE.2', side: -120, z: 17.25, mirrored: true });
  });

  it('brings the letters in one after another, swelling, between the first and ninth second', () => {
    expect(letterPose(1, 0, 16)).toBeNull();
    expect(letterPose(9, 0, 16)).toBeNull();
    expect(letterPose(1.25, 0, 16)).toEqual({ scale: 0.75, alpha: 1 });
    // The last letter starts 0.7 s after the first, less a sixteenth of that.
    expect(letterPose(1.25, 15, 16)!.alpha).toBe(0);
    expect(letterPose(2.75, 0, 16)!.scale).toBeCloseTo(0.5 + 0.5 * 1.25, 5);
    expect(letterPose(4.75, 0, 16)!.alpha).toBeCloseTo(0.5 * 2, 5);
    expect(letterPose(4.9, 0, 16)!.alpha).toBeCloseTo(0.4, 5);
  });

  it('keeps the credits still and unseen until their delay is over', () => {
    const roll = new CreditsRoll(1000, 20);
    roll.update(19, null);
    expect(roll.alpha).toBe(0);
    expect(roll.offset).toBe(0);
    roll.update(1.25, null);
    expect(roll.alpha).toBeCloseTo(0.25, 5);
    expect(roll.offset).toBeGreaterThan(0);
  });
});
