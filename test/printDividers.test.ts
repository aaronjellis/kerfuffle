import { describe, expect, it } from 'vitest';
import type { PrintDivider } from '../src/engine/types';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import {
  type DividerSpace,
  clearSizes,
  deleteDivider,
  isValidLayout,
  moveDivider,
  moveLimits,
  placeDivider,
  previewDivider,
  resolveDividers,
  resolveDividerThickness,
  setClearSize,
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

const build = () => {
  let l = placeDivider([], space, 'y', at(40, 20), 'v');
  l = placeDivider(l, space, 'x', at(10, 30), 'left');
  l = placeDivider(l, space, 'x', at(70, 20), 'right');
  return l;
};
const get = (l: PrintDivider[], id: string) => l.find((d) => d.id === id)!;

describe('moveDivider', () => {
  it('slides and stretches attached dividers', () => {
    const l = moveDivider(build(), space, 'v', 55);
    expect(get(l, 'v').pos).toBe(55);
    expect(get(l, 'left').to).toBe(55);
    expect(get(l, 'right').from).toBe(55);
    expect(isValidLayout(l, space)).toBe(true);
  });
  it('clamps at 5 mm clear of a wall', () => {
    expect(get(moveDivider([get(build(), 'v')], space, 'v', 500), 'v').pos).toBe(94);
  });
  it('clamps at 5 mm clear of the other wall, with its attached divider still attached', () => {
    const l = moveDivider(build(), space, 'v', 0);
    expect(get(l, 'v').pos).toBe(6);
    expect(get(l, 'left')).toMatchObject({ from: 0, to: 6 });
  });
  it('stops at the end of the divider it rests on', () => {
    const l: PrintDivider[] = [
      { id: 'top', axis: 'x', pos: 40, from: 0, to: 100 },
      { id: 'g', axis: 'y', pos: 50, from: 0, to: 20 },
      { id: 'short', axis: 'x', pos: 20, from: 0, to: 50 },
      { id: 'd', axis: 'y', pos: 20, from: 20, to: 40 },
    ];
    expect(isValidLayout(l, space)).toBe(true);
    expect(moveLimits(l, space, 'd').max).toBeLessThanOrEqual(50);
    const moved = moveDivider(l, space, 'd', 90);
    expect(get(moved, 'd').pos).toBeGreaterThan(20);
    expect(isValidLayout(moved, space)).toBe(true);
  });
  it('ignores an unknown id', () => {
    const l = build();
    expect(moveDivider(l, space, 'nope', 10)).toBe(l);
  });
});

describe('setClearSize', () => {
  it('sets an exact compartment size on either side', () => {
    const l = [get(build(), 'v')];
    expect(clearSizes(setClearSize(l, space, 'v', 'before', 50), space, 'v').before).toBe(50);
    expect(clearSizes(setClearSize(l, space, 'v', 'after', 12.5), space, 'v').after).toBe(12.5);
  });
  it('clamps to the limits', () => {
    const l = [get(build(), 'v')];
    expect(clearSizes(setClearSize(l, space, 'v', 'before', 1), space, 'v').before).toBe(5);
  });
});

describe('deleteDivider', () => {
  it('grows the dividers that ended on it', () => {
    const l = deleteDivider(build(), space, 'v');
    expect(get(l, 'left')).toMatchObject({ from: 0, to: 100 });
    expect(get(l, 'right')).toMatchObject({ from: 0, to: 100 });
    expect(isValidLayout(l, space)).toBe(true);
  });
  it('grows only to the next divider', () => {
    const l = deleteDivider(placeDivider(build(), space, 'y', at(80, 50), 'far'), space, 'v');
    expect(get(l, 'left')).toMatchObject({ from: 0, to: 80 });
  });
  it('merges two collinear dividers that meet after growing', () => {
    let l = placeDivider([], space, 'y', at(40, 20), 'v');
    l = placeDivider(l, space, 'x', at(10, 30), 'a');
    l = placeDivider(l, space, 'x', at(70, 30), 'b');
    const out = deleteDivider(l, space, 'v');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ axis: 'x', pos: get(l, 'a').pos, from: 0, to: 100 });
  });
  it('removes a dependent that has no room to grow', () => {
    let l = placeDivider([], space, 'y', at(40, 20), 'v');
    l = placeDivider(l, space, 'x', at(10, 30), 'a');
    l = placeDivider(l, space, 'x', at(70, 33), 'b');
    const out = deleteDivider(l, space, 'v');
    expect(out.map((d) => d.id)).toEqual(['a']);
    expect(isValidLayout(out, space)).toBe(true);
  });
});

describe('resolveDividers', () => {
  const base = { ...DEFAULT_BOX_PARAMETERS, wallThickness3dMm: 2, printDividersBasis: { w: 100, d: 60 }, printDividers: build() };
  it('follows the wall thickness until a divider thickness is set', () => {
    expect(resolveDividerThickness(base)).toBe(2);
    expect(resolveDividerThickness({ ...base, dividerThickness3dMm: 1.6 })).toBe(1.6);
    expect(resolveDividerThickness({ ...base, dividerThickness3dMm: 99 })).toBe(8);
  });
  it('returns the layout unchanged at its own size', () => {
    const r = resolveDividers(base, 100, 60, 3);
    expect(r.layout).toEqual(build());
    expect(r.hidden).toBe(0);
    expect(r.space).toEqual({ w: 100, d: 60, t: 2, rIn: 3 });
  });
  it('scales positions with the box', () => {
    const r = resolveDividers(base, 200, 60, 3);
    expect(r.layout.find((d) => d.id === 'v')!.pos).toBe(80);
    expect(r.layout.find((d) => d.id === 'right')).toMatchObject({ from: 80, to: 200 });
    expect(isValidLayout(r.layout, r.space)).toBe(true);
  });
  it.each([
    ['a smaller box', () => resolveDividers(base, 10, 60, 3)],
    ['a thicker divider', () => resolveDividers({ ...base, dividerThickness3dMm: 8, printDividers: [...build(), { id: 'n', axis: 'y' as const, pos: 50, from: 0, to: 20 }] }, 100, 60, 3)],
    ['a larger fillet', () => resolveDividers({ ...base, printDividers: [{ id: 'e', axis: 'y' as const, pos: 7, from: 0, to: 60 }] }, 100, 60, 12)],
  ])('hides dividers that no longer fit: %s', (_, run) => {
    const r = run();
    expect(r.hidden).toBeGreaterThan(0);
    expect(isValidLayout(r.layout, r.space)).toBe(true);
  });
  it('is empty with no basis', () => {
    expect(resolveDividers({ ...base, printDividersBasis: { w: 0, d: 0 } }, 100, 60, 3).layout).toEqual([]);
  });
});

it('stays valid through 300 random edits', () => {
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  let l: PrintDivider[] = [];
  let placed = 0;
  let most = 0;
  for (let i = 0; i < 300; i++) {
    const roll = rnd();
    if (roll < 0.5 || l.length === 0) {
      l = placeDivider(l, space, rnd() < 0.5 ? 'x' : 'y', at(rnd() * space.w, rnd() * space.d), `d${placed++}`);
    } else {
      const d = l[Math.floor(rnd() * l.length)];
      l = roll < 0.8 ? moveDivider(l, space, d.id, rnd() * (d.axis === 'y' ? space.w : space.d)) : deleteDivider(l, space, d.id);
    }
    most = Math.max(most, l.length);
    expect(isValidLayout(l, space), `after step ${i}: ${JSON.stringify(l)}`).toBe(true);
  }
  expect(most).toBeGreaterThan(4);
});
