import { describe, expect, it } from 'vitest';
import type { PrintDivider } from '../src/engine/types';
import {
  type DividerSpace,
  isValidLayout,
  placeDivider,
  previewDivider,
} from '../src/engine/printDividers';

const space: DividerSpace = { w: 100, d: 60, t: 2, rIn: 3 };
const at = (x: number, y: number) => ({ x, y });

describe('previewDivider', () => {
  it('runs wall to wall in an empty box and snaps the gap before it', () => {
    const p = previewDivider([], space, 'y', at(40.3, 20))!;
    expect(p.divider).toEqual({ axis: 'y', pos: 40, from: 0, to: 60 });
    expect(p.clearBefore).toBe(39);
    expect(p.clearAfter).toBe(59);
  });
  it('stops at a perpendicular divider on the cursor side', () => {
    const l = placeDivider([], space, 'x', at(50, 30), 'h');
    expect(previewDivider(l, space, 'y', at(40, 10))!.divider).toMatchObject({ from: 0, to: 30 });
    expect(previewDivider(l, space, 'y', at(40, 50))!.divider).toMatchObject({ from: 30, to: 60 });
  });
  it('measures the gap from a parallel divider face to face', () => {
    const l = placeDivider([], space, 'y', at(40, 20), 'a');
    const p = previewDivider(l, space, 'y', at(60.2, 20))!;
    expect(p.clearBefore).toBe(18);
    expect(p.divider.pos).toBe(60);
  });
  it.each([[3, 20], [97.5, 20], [-1, 20], [40, 61]])('refuses (%d, %d): too close to a wall or outside', (x, y) => {
    expect(previewDivider([], space, 'y', at(x, y))).toBeNull();
  });
  it('refuses a spot within 5 mm clear of a parallel divider', () => {
    const l = placeDivider([], space, 'y', at(40, 20), 'a');
    expect(previewDivider(l, space, 'y', at(45, 20))).toBeNull();
  });
  it('refuses an end inside a corner fillet', () => {
    expect(previewDivider([], { ...space, rIn: 8 }, 'y', at(7, 20))).toBeNull();
  });
  it('fits a divider into the smallest allowed section', () => {
    const tight = placeDivider([], space, 'x', at(50, 6.4), 'h');
    expect(previewDivider(tight, space, 'y', at(40, 3))!.divider).toMatchObject({ from: 0, to: 6 });
  });
});

describe('placeDivider', () => {
  it('adds the previewed divider with the given id', () => {
    expect(placeDivider([], space, 'y', at(40.3, 20), 'a')).toEqual([{ id: 'a', axis: 'y', pos: 40, from: 0, to: 60 }]);
  });
  it('returns the same layout when the spot is refused', () => {
    const l: PrintDivider[] = [];
    expect(placeDivider(l, space, 'y', at(2, 20), 'a')).toBe(l);
  });
  it('keeps the layout valid', () => {
    let l = placeDivider([], space, 'x', at(50, 30), 'h');
    l = placeDivider(l, space, 'y', at(40, 10), 'v1');
    l = placeDivider(l, space, 'y', at(70, 50), 'v2');
    expect(l).toHaveLength(3);
    expect(isValidLayout(l, space)).toBe(true);
  });
});

describe('isValidLayout', () => {
  it('rejects a floating end', () => {
    expect(isValidLayout([{ id: 'a', axis: 'y', pos: 40, from: 0, to: 30 }], space)).toBe(false);
  });
  it('rejects a crossing', () => {
    expect(
      isValidLayout(
        [
          { id: 'a', axis: 'y', pos: 40, from: 0, to: 60 },
          { id: 'b', axis: 'x', pos: 30, from: 0, to: 100 },
        ],
        space,
      ),
    ).toBe(false);
  });
});
