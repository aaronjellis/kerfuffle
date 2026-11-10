# Printed box dividers implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user place, slide, and delete freeform dividers in the 3D-printed box, in the 2D plan and then in the 3D view, and print them as part of the base.

**Architecture:** A pure layout module (`src/engine/printDividers.ts`) owns every rule: where a divider lands, how far it can slide, what grows on delete, and how a saved layout adapts to a resized box. Geometry, the 2D plan, both viewports, and the inspector all read the layout through one function, `resolveDividers`. A React hook holds the tool state and a divider-only undo history; the two viewports are thin pointer adapters over it.

**Tech stack:** TypeScript, React 18, three.js 0.170, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-09-printed-box-dividers-design.md`. Read it first.

## Global constraints

- Work on a branch named `printed-box-dividers`, not `main`.
- Only the `3d-snap-box` template changes. The laser organizer's `dividerCols` / `dividerRows` and `DividersSection` stay as they are.
- Snap: the clear gap on the divider's low-coordinate side snaps to 1 mm. Minimum clear section: 5 mm. Minimum divider length: 5 mm.
- Divider height never exceeds `baseH - floor`.
- Divider thickness follows `wallThickness3dMm` until edited; one value for all dividers.
- Names, labels, and copy are Kerfuffle's own. Don't borrow tool names, presets, or layouts from other products.
- UI copy is sentence case. Use the tokens in `src/ui/tokens.css` and `src/ui/stageColors.ts`; no new colors.
- Hotkeys never fire while an `input`, `textarea`, `select`, or contenteditable element has focus.
- `npm test` and `npm run build` pass at the end of every task.

## Review focus

1. **A `.kerf` file with bad divider entries** (wrong `axis`, non-finite numbers, missing `id`, zero basis): the file opens and the bad entries are dropped. Test in Task 1.
2. **A divider end on a wall after the inner fillet grows, or a section squeezed under 5 mm by a thicker divider or a smaller box:** the divider is hidden, the rest stay valid, and nothing is deleted from the saved layout. Test in Task 3.
3. **Sliding a divider past the end of the divider it rests on:** the slide stops at the support's end; the divider never floats. Test in Task 3.
4. **Pressing `Delete`, `Backspace`, `R`, or `Cmd/Ctrl+Z` while typing in a number field:** the field gets the key and the layout doesn't change. Test in Task 6.
5. **A short base** (interior 5 mm high, the engine's minimum): dividers still build, capped at the rim, and the base STL stays valid. Test in Task 4.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/engine/types.ts` (modify) | `PrintDivider`, three new `BoxParameters` fields |
| `src/engine/presets.ts` (modify) | Defaults for the new fields |
| `src/engine/projectFile.ts` (modify) | Validate divider entries on load |
| `src/engine/printDividers.ts` (create) | All layout rules; no React, no three.js |
| `src/engine/printParts.ts` (modify) | `buildDividerPieces`, `'divider'` part id |
| `src/engine/printWorld.ts`, `printStl.ts`, `print3dEngine.ts` (modify) | Add divider pieces to the base in 3D, STL, and the 2D plan |
| `src/ui/parts.ts`, `src/ui/sections/index.ts` (modify), `src/ui/sections/PrintDividersSection.tsx` (create) | Inspector section |
| `src/ui/dividerHistory.ts` (create) | Pure undo/redo stack and the typing-target check |
| `src/ui/useDividerEditing.ts` (create) | Tool state, actions, hotkeys |
| `src/ui/DividerToolbar.tsx` (create), `src/ui/Stage.tsx`, `src/App.tsx` (modify) | Tool buttons on the stage |
| `src/components/DividerOverlay2D.tsx` (create), `src/components/Viewport2D.tsx` (modify) | 2D tool |
| `src/components/Viewport3D.tsx` (modify) | 3D tool |
| `test/printDividers.test.ts`, `test/dividerHistory.test.ts` (create); `test/projectFile.test.ts`, `test/printParts.test.ts`, `test/parts.test.ts` (modify) | Tests |

### Shared vocabulary

- **Interior frame:** millimetres, origin at the inner front-left corner of the base. `x` runs across the width (0..`w`), `y` front to back (0..`d`). In the print frame this is `(wall + x, wall + y)`.
- **`axis`:** the axis a divider runs along. An `axis: 'y'` divider runs front to back at `x = pos`.
- **Before / after:** the low-coordinate and high-coordinate sides of a divider on its perpendicular axis.
- **End coordinates:** `from` and `to` are `0` or the interior extent at a wall, and the supporting divider's `pos` (its centerline) at a divider.

---

### Task 1: Data model and project file

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/presets.ts`, `src/engine/projectFile.ts`
- Test: `test/projectFile.test.ts`

**Interfaces:**
- Produces, in `types.ts`:

```ts
export interface PrintDivider {
  id: string;
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
}
// added to BoxParameters, under "3D Print specific":
printDividers: PrintDivider[];
/** The interior size (mm) the saved positions were drawn for. */
printDividersBasis: { w: number; d: number };
/** 0 follows wallThickness3dMm. */
dividerThickness3dMm: number;
/** Above the floor. 0 means up to the base rim. */
dividerHeight3dMm: number;
```

- Defaults in `DEFAULT_BOX_PARAMETERS`: `printDividers: []`, `printDividersBasis: { w: 0, d: 0 }`, `dividerThickness3dMm: 0`, `dividerHeight3dMm: 0`.

- [ ] **Step 1: Write the failing tests** in `test/projectFile.test.ts`

```ts
const good = { id: 'a', axis: 'y', pos: 40, from: 0, to: 80 };
const file = (params: object) => JSON.stringify({ format: 'kerfuffle-project', version: 1, params: { templateId: '3d-snap-box', ...params } });

it('round-trips a divider layout', () => {
  const params = { ...DEFAULT_BOX_PARAMETERS, printDividers: [good], printDividersBasis: { w: 110, d: 80 }, dividerThickness3dMm: 1.6 };
  const back = parseProject(serializeProject({ params, artworks: [], displayUnit: 'mm' })).params;
  expect(back.printDividers).toEqual([good]);
  expect(back.printDividersBasis).toEqual({ w: 110, d: 80 });
  expect(back.dividerThickness3dMm).toBe(1.6);
});
it('opens an old file with no dividers', () => {
  expect(parseProject(file({})).params.printDividers).toEqual([]);
});
it('drops bad divider entries and keeps good ones', () => {
  const bad = [{ ...good, axis: 'z' }, { ...good, pos: null }, { ...good, id: 7 }, { ...good, from: 50, to: 10 }, 'x', good];
  const p = parseProject(file({ printDividers: bad, printDividersBasis: { w: 110, d: 80 } })).params;
  expect(p.printDividers).toEqual([good]);
});
it('drops every divider when the basis is unusable', () => {
  const p = parseProject(file({ printDividers: [good], printDividersBasis: { w: 0, d: 'x' } })).params;
  expect(p.printDividers).toEqual([]);
  expect(p.printDividersBasis).toEqual({ w: 0, d: 0 });
});
```

- [ ] **Step 2: Run** `npx vitest run test/projectFile.test.ts`. Expected: FAIL, the new fields don't exist.
- [ ] **Step 3: Add the type, the four fields, and the defaults.**
- [ ] **Step 4: Validate in `parseProject`**, after the `facePatterns` filter. Keep a divider only if `id` is a string, `axis` is `'x'` or `'y'`, `pos`/`from`/`to` are finite, and `from < to`. If the basis isn't two finite numbers above 0, reset it to `{ w: 0, d: 0 }` and empty the list. Duplicate ids: keep the first.
- [ ] **Step 5: Run** `npx vitest run test/projectFile.test.ts` and `npm run build`. Expected: PASS, no type errors.
- [ ] **Step 6: Commit** `git commit -am "Printed box dividers: data model and project file"`

---

### Task 2: Layout module, placing

**Files:**
- Create: `src/engine/printDividers.ts`
- Test: `test/printDividers.test.ts`

**Interfaces:**
- Consumes: `PrintDivider` from Task 1.
- Produces:

```ts
export const DIVIDER_SNAP_MM = 1;
export const MIN_SECTION_MM = 5;
/** The interior and the settings every rule needs. */
export interface DividerSpace { w: number; d: number; t: number; rIn: number }
export interface DividerPreview {
  divider: Omit<PrintDivider, 'id'>;
  /** Clear gap, face to face, to the neighbor on each side. */
  clearBefore: number;
  clearAfter: number;
}
export function previewDivider(layout: PrintDivider[], space: DividerSpace, axis: 'x' | 'y', point: { x: number; y: number }): DividerPreview | null;
export function placeDivider(layout: PrintDivider[], space: DividerSpace, axis: 'x' | 'y', point: { x: number; y: number }, id: string): PrintDivider[];
export function isValidLayout(layout: PrintDivider[], space: DividerSpace): boolean;
```

**Rules the tests don't fully pin** (implement exactly these):

1. *Ends.* For a divider on axis `A` at `pos`, through cursor coordinate `c` along `A`: `from` is the largest of `0` and the `pos` of every perpendicular divider `e` with `e.from <= pos <= e.to` and `e.pos <= c`; `to` is the mirror image with the interior extent.
2. *Parallel neighbors.* The walls, plus every same-axis divider whose span overlaps `(from, to)` as an open interval. Clear gap to a wall is `pos - t/2` (or `extent - pos - t/2`); to a divider it is the centerline distance minus `t`.
3. *Snap.* Take the raw cursor position, compute the raw clear gap before, round it to `DIVIDER_SNAP_MM`, and derive `pos` from it. Round stored numbers to 0.001.
4. *Allowed* only if both clear gaps are at least `MIN_SECTION_MM`, `to - from` is at least `MIN_SECTION_MM`, the point is inside the interior, and each end that lands on a wall satisfies `pos - t/2 >= rIn` and `pos + t/2 <= extent - rIn` (the end clears the corner fillet). Recompute the ends after snapping; if they change, the preview is `null`.
5. *`isValidLayout`* checks, for every divider: each end is at a wall or on a perpendicular divider that spans it; rule 4 holds; no two same-axis dividers at the same `pos` overlap; no perpendicular pair crosses (one passing strictly through the other's interior). Compare with a tolerance of `1e-6`.
6. `placeDivider` returns the same array when the preview is `null`.

- [ ] **Step 1: Write the failing tests**

```ts
const space: DividerSpace = { w: 100, d: 60, t: 2, rIn: 3 };
const at = (x: number, y: number) => ({ x, y });

describe('previewDivider', () => {
  it('runs wall to wall in an empty box and snaps the gap before it', () => {
    const p = previewDivider([], space, 'y', at(40.3, 20))!;
    expect(p.divider).toEqual({ axis: 'y', pos: 40, from: 0, to: 60 }); // gap 39 + t/2
    expect(p.clearBefore).toBe(39);
    expect(p.clearAfter).toBe(59);
  });
  it('stops at a perpendicular divider on the cursor side', () => {
    const l = placeDivider([], space, 'x', at(50, 30), 'h');   // side to side at y = 30
    expect(previewDivider(l, space, 'y', at(40, 10))!.divider).toMatchObject({ from: 0, to: 30 });
    expect(previewDivider(l, space, 'y', at(40, 50))!.divider).toMatchObject({ from: 30, to: 60 });
  });
  it('measures the gap from a parallel divider face to face', () => {
    const l = placeDivider([], space, 'y', at(40, 20), 'a');   // pos 40
    const p = previewDivider(l, space, 'y', at(60.2, 20))!;
    expect(p.clearBefore).toBe(18);
    expect(p.divider.pos).toBe(60);                            // 40 + 1 + 18 + 1
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
    const tight = placeDivider([], space, 'x', at(50, 6.4), 'h'); // 5 clear before it, centerline at y = 6
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
    expect(isValidLayout(l, space)).toBe(true);
  });
});
describe('isValidLayout', () => {
  it('rejects a floating end and a crossing', () => {
    expect(isValidLayout([{ id: 'a', axis: 'y', pos: 40, from: 0, to: 30 }], space)).toBe(false);
    expect(isValidLayout([
      { id: 'a', axis: 'y', pos: 40, from: 0, to: 60 },
      { id: 'b', axis: 'x', pos: 30, from: 0, to: 100 },
    ], space)).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/printDividers.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the three functions to the rules above.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Printed box dividers: place and preview rules"`

---

### Task 3: Layout module, move, delete, and resolve

**Files:**
- Modify: `src/engine/printDividers.ts`
- Test: `test/printDividers.test.ts`

**Interfaces:**
- Produces:

```ts
/** The positions a divider may slide between; min > max means it can't move. */
export function moveLimits(layout: PrintDivider[], space: DividerSpace, id: string): { min: number; max: number };
/** Slides to the snapped, clamped position; dividers ending on it follow. */
export function moveDivider(layout: PrintDivider[], space: DividerSpace, id: string, rawPos: number): PrintDivider[];
/** Sets the clear gap on one side, clamped to the limits. No snapping. */
export function setClearSize(layout: PrintDivider[], space: DividerSpace, id: string, side: 'before' | 'after', clearMm: number): PrintDivider[];
export function clearSizes(layout: PrintDivider[], space: DividerSpace, id: string): { before: number; after: number };
export function deleteDivider(layout: PrintDivider[], space: DividerSpace, id: string): PrintDivider[];
/** The saved layout as it applies to this box: scaled from its basis, with misfits left out. */
export function resolveDividers(params: BoxParameters, innerW: number, innerD: number, rIn: number): { layout: PrintDivider[]; space: DividerSpace; hidden: number };
export function resolveDividerThickness(params: BoxParameters): number; // dividerThickness3dMm > 0 ? clamp 0.8..8 : max(1.2, wallThickness3dMm)
```

**Rules:**

1. *Attached dividers* of `D`: perpendicular dividers `e` with `D.from <= e.pos <= D.to` and `e.from === D.pos` or `e.to === D.pos`.
2. *`moveLimits`* is the tightest of: the parallel neighbors (Task 2, rule 2) plus `MIN_SECTION_MM` clear; each attached divider keeping `to - from >= MIN_SECTION_MM`; each of `D`'s own ends that rests on a divider `F` keeping `F.from <= pos <= F.to`; and the corner-fillet rule for each end on a wall.
3. *`moveDivider`* snaps the clear gap before (as in placing), clamps to the limits, then sets the matching end of every attached divider to the new `pos`. An unknown id returns the layout unchanged.
4. *`deleteDivider`* removes `D`, then for each divider that was attached, recomputes the freed end by Task 2's rule 1 using a point just past the old end. If the grown divider now runs onto a same-axis divider at the same `pos`, merge the two into one that keeps the grown divider's id.
5. *`resolveDividers`*: if the basis is `{0, 0}` or the list is empty, the layout is empty. Otherwise scale `x` coordinates by `innerW / basis.w` and `y` by `innerD / basis.d`, round to 0.001, then repeat until stable: find the first divider that breaks Task 2's rule 4 or has a floating end, and remove it with `deleteDivider`. `hidden` is how many were removed. Scaled positions are not re-snapped.

- [ ] **Step 1: Write the failing tests**

```ts
const build = () => {
  let l = placeDivider([], space, 'y', at(40, 20), 'v');      // x = 40, wall to wall
  l = placeDivider(l, space, 'x', at(10, 30), 'left');         // y = 30, from wall to v
  l = placeDivider(l, space, 'x', at(70, 20), 'right');        // y = 20, from v to wall
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
    expect(get(moveDivider([get(build(), 'v')], space, 'v', 500), 'v').pos).toBe(94); // 100 - 5 - t/2
  });
  it('clamps at 5 mm clear of the other wall, with its attached divider still attached', () => {
    const l = moveDivider(build(), space, 'v', 0);
    expect(get(l, 'v').pos).toBe(6);                                   // 5 + t/2
    expect(get(l, 'left')).toMatchObject({ from: 0, to: 6 });
  });
  it('stops at the end of the divider it rests on', () => {
    // `short` and `g` meet in an L at (50, 20). `d` stands on `short`; `g` is not beside `d`
    // (their spans only touch), so only the support rule can stop `d` at x = 50.
    const l: PrintDivider[] = [
      { id: 'top', axis: 'x', pos: 40, from: 0, to: 100 },
      { id: 'g', axis: 'y', pos: 50, from: 0, to: 20 },
      { id: 'short', axis: 'x', pos: 20, from: 0, to: 50 },
      { id: 'd', axis: 'y', pos: 20, from: 20, to: 40 },
    ];
    expect(isValidLayout(l, space)).toBe(true);
    expect(moveLimits(l, space, 'd').max).toBeLessThanOrEqual(50);
    expect(isValidLayout(moveDivider(l, space, 'd', 90), space)).toBe(true);
  });
  it('ignores an unknown id', () => { const l = build(); expect(moveDivider(l, space, 'nope', 10)).toBe(l); });
});
describe('setClearSize', () => {
  it('sets an exact compartment size on either side', () => {
    const l = [get(build(), 'v')];
    expect(clearSizes(setClearSize(l, space, 'v', 'before', 50), space, 'v').before).toBe(50);
    expect(clearSizes(setClearSize(l, space, 'v', 'after', 12.5), space, 'v').after).toBe(12.5);
  });
});
describe('deleteDivider', () => {
  it('grows the dividers that ended on it', () => {
    const l = deleteDivider(build(), space, 'v');
    expect(get(l, 'left')).toMatchObject({ from: 0, to: 100 });
    expect(get(l, 'right')).toMatchObject({ from: 0, to: 100 });
    expect(isValidLayout(l, space)).toBe(true);
  });
  it('merges two collinear dividers that meet after growing', () => {
    let l = placeDivider([], space, 'y', at(40, 20), 'v');
    l = placeDivider(l, space, 'x', at(10, 30), 'a');
    l = placeDivider(l, space, 'x', at(70, 30), 'b');
    const out = deleteDivider(l, space, 'v');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ axis: 'x', pos: get(l, 'a').pos, from: 0, to: 100 });
  });
});
describe('resolveDividers', () => {
  const base = { ...DEFAULT_BOX_PARAMETERS, wallThickness3dMm: 2, printDividersBasis: { w: 100, d: 60 }, printDividers: build() };
  it('returns the layout unchanged at its own size', () => {
    const r = resolveDividers(base, 100, 60, 3);
    expect(r.layout).toEqual(build());
    expect(r.hidden).toBe(0);
    expect(r.space).toEqual({ w: 100, d: 60, t: 2, rIn: 3 });
  });
  it('scales positions with the box', () => {
    const r = resolveDividers(base, 200, 60, 3);
    expect(r.layout.find((d) => d.id === 'v')!.pos).toBe(80);
    expect(isValidLayout(r.layout, r.space)).toBe(true);
  });
  it.each([
    ['a smaller box', () => resolveDividers(base, 10, 60, 3)],
    ['a thicker divider', () => resolveDividers({ ...base, dividerThickness3dMm: 8, printDividers: [...build(), { id: 'n', axis: 'y', pos: 50, from: 0, to: 20 }] }, 100, 60, 3)],
    ['a larger fillet', () => resolveDividers({ ...base, printDividers: [{ id: 'e', axis: 'y', pos: 7, from: 0, to: 60 }] }, 100, 60, 12)],
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
  // Seeded LCG. Each step: place at a random point and axis, move a random divider to a random
  // position, or delete a random divider. Assert isValidLayout(l, space) after every step.
});
```

Write the body of the random-edit test: a seeded linear congruential generator, 300 steps, operation chosen 50% place, 30% move, 20% delete.

- [ ] **Step 2: Run** `npx vitest run test/printDividers.test.ts`. Expected: FAIL, functions missing.
- [ ] **Step 3: Implement** the seven functions to the rules above.
- [ ] **Step 4: Run** the same command. Expected: PASS. If a hand-written expectation disagrees with the rules, the rules win: fix the number and say so in the commit message.
- [ ] **Step 5: Commit** `git commit -am "Printed box dividers: move, delete, and resolve rules"`

---

### Task 4: Geometry, STL, and the 2D plan

**Files:**
- Modify: `src/engine/printParts.ts`, `src/engine/printWorld.ts`, `src/engine/printStl.ts`, `src/engine/print3dEngine.ts`
- Test: `test/printParts.test.ts`, `test/printWorld.test.ts`

**Interfaces:**
- Consumes: `resolveDividers` from Task 3.
- Produces:

```ts
// printParts.ts
export type PrintPartId = 'shell' | 'lip' | 'hinge' | 'clasp' | 'divider';
export interface PrintPiece { partId: PrintPartId; geometry: THREE.BufferGeometry; dividerId?: string }
/** dividerHeight3dMm > 0 ? min(it, baseH - floor) : baseH - floor; never under 2 or over baseH - floor. */
export function resolveDividerHeight(params: BoxParameters, dims: PrintBoxDims): number;
/** One box per divider in the print frame, base only. */
export function buildDividerPieces(params: BoxParameters, dims: PrintBoxDims): PrintPiece[];
// printWorld.ts
export interface PrintWorldPiece { partId: PrintPartId; geometry: THREE.BufferGeometry; dividerId?: string }
```

Each divider is a `THREE.BoxGeometry`, made non-indexed. In the print frame, across its thickness it spans `wall + pos ± t/2`. Along its length it spans `wall + from` to `wall + to`, pushed `wall / 2` further into the wall at an end on a wall (an end on a divider already reaches that divider's centerline). In z it spans `floor - 0.01` to `floor + height`.

`buildDividerPieces` calls `resolveDividers(params, dims.innerW, dims.innerD, dims.rIn)`.

- [ ] **Step 1: Write the failing tests** in `test/printParts.test.ts`

```ts
describe('printed dividers', () => {
  const withDividers = { ...p, wallThickness3dMm: 2, printDividersBasis: { w: 110, d: 80 },
    printDividers: [{ id: 'v', axis: 'y' as const, pos: 40, from: 0, to: 80 }, { id: 'h', axis: 'x' as const, pos: 30, from: 40, to: 110 }] };
  const bounds = (piece: PrintPiece) => { piece.geometry.computeBoundingBox(); return piece.geometry.boundingBox!; };

  it('builds one closed, non-indexed box per divider, tagged with its id', () => {
    const d = computePrintBoxDims(withDividers, 110, 80, 55);
    const pieces = buildDividerPieces(withDividers, d);
    expect(pieces.map((x) => x.dividerId)).toEqual(['v', 'h']);
    for (const piece of pieces) {
      expect(piece.partId).toBe('divider');
      expect(piece.geometry.index).toBeNull();
      expect(piece.geometry.getAttribute('position').count).toBe(36);
    }
  });
  it('sinks into the floor and both walls and stops at the rim', () => {
    const d = computePrintBoxDims(withDividers, 110, 80, 55);
    const b = bounds(buildDividerPieces(withDividers, d)[0]);
    expect(b.min.x).toBeCloseTo(d.wall + 39); expect(b.max.x).toBeCloseTo(d.wall + 41);
    expect(b.min.y).toBeCloseTo(d.wall / 2);  expect(b.max.y).toBeCloseTo(d.outerD - d.wall / 2);
    expect(b.min.z).toBeLessThan(d.floor);    expect(b.max.z).toBeCloseTo(d.baseH);
  });
  it('ends a divider on another divider at its centerline', () => {
    const d = computePrintBoxDims(withDividers, 110, 80, 55);
    expect(bounds(buildDividerPieces(withDividers, d)[1]).min.x).toBeCloseTo(d.wall + 40);
  });
  it('honors a lower height and never passes the rim', () => {
    const d = computePrintBoxDims(withDividers, 110, 80, 55);
    expect(resolveDividerHeight({ ...withDividers, dividerHeight3dMm: 10 }, d)).toBe(10);
    expect(resolveDividerHeight({ ...withDividers, dividerHeight3dMm: 999 }, d)).toBeCloseTo(d.baseH - d.floor);
    expect(resolveDividerHeight(withDividers, d)).toBeCloseTo(d.baseH - d.floor);
  });
  it('still builds in the shortest base', () => {
    const d = computePrintBoxDims({ ...withDividers, lidHeightMm: 100 }, 110, 80, 20);
    const h = resolveDividerHeight(withDividers, d);
    expect(h).toBeLessThanOrEqual(d.baseH - d.floor + 1e-9);
    expect(bounds(buildDividerPieces(withDividers, d)[0]).max.z).toBeLessThanOrEqual(d.baseH + 1e-9);
  });
  it('puts dividers in the base STL only', () => {
    const tri = (s: string) => (s.match(/facet normal/g) ?? []).length;
    const plain = export3DPrintBoxStlParts({ ...withDividers, printDividers: [] });
    const parts = export3DPrintBoxStlParts(withDividers);
    expect(tri(parts.base) - tri(plain.base)).toBe(24);
    expect(tri(parts.lid)).toBe(tri(plain.lid));
    expect(tri(export3DPrintBoxStl(withDividers)) - tri(export3DPrintBoxStl({ ...withDividers, printDividers: [] }))).toBe(24);
  });
  it('draws each divider on the base plan and none on the lid', () => {
    const m = generateBoxModel(withDividers);
    const ids = (panelId: string) => m.panels2D.find((x) => x.id === panelId)!.paths.map((x) => x.id);
    expect(ids('base-3d-plan')).toEqual(expect.arrayContaining(['3d-divider-v', '3d-divider-h']));
    expect(ids('lid-3d-plan').some((id) => id.startsWith('3d-divider'))).toBe(false);
  });
});
```

`withDividers` uses the default `dimensionReference`; if `generateBoxModel` resolves an interior other than 110 × 80, set `widthMm`/`depthMm` so it does. In `test/printWorld.test.ts` add one test: `buildPrintPartWorldGeometry(model, 'base')` returns two pieces with `partId === 'divider'` carrying `dividerId`, and `'lid'` returns none.

- [ ] **Step 2: Run** `npx vitest run test/printParts.test.ts test/printWorld.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `resolveDividerHeight` and `buildDividerPieces`. Add the divider pieces for `part === 'base'` in `buildPrintPartWorldGeometry` (carry `dividerId` through the map) and in `partGeometries` in `printStl.ts`.
- [ ] **Step 4: Add plan outlines** in `generate3DPrintBox`, in `buildPlan('base')`: one closed `layer: 'score'` rectangle per resolved divider, id `3d-divider-<id>`, at the divider's footprint (thickness `t`, length `from`..`to`), offset by `wall` and `oy`.
- [ ] **Step 5: Run** `npm test`. Expected: PASS, including the existing print and export tests.
- [ ] **Step 6: Commit** `git commit -am "Printed box dividers: geometry, STL, and plan outlines"`

---

### Task 5: Inspector section

**Files:**
- Create: `src/ui/sections/PrintDividersSection.tsx`
- Modify: `src/ui/parts.ts`, `src/ui/sections/index.ts`
- Test: `test/parts.test.ts`, `test/sections.test.ts`

**Interfaces:**
- Consumes: `resolveDividers`, `resolveDividerThickness`, `resolveDividerHeight`.
- Produces: `PartId` gains `'print-dividers'`. The `3d-snap-box` part list becomes `['size', 'shell', 'print-dividers', 'hinge', 'clasp', 'labels', 'artwork', 'print-export']`. The mesh part id `'divider'` maps to `'print-dividers'`.

Section contents, in order, following `ShellSection`'s `Field` + `NumberField` pattern:

- **Divider thickness** (`0.8`..`8` mm): shows `resolveDividerThickness(params)`; editing writes `dividerThickness3dMm`. Below it, when the value is non-zero, a text button **Match wall thickness** that writes `0`.
- **Divider height** (`2`..`baseH - floor` mm): shows `resolveDividerHeight`; editing writes `dividerHeight3dMm`; a value at or above the maximum writes `0`.
- A line of text: `No dividers yet. Pick Divider on the preview, then click inside the box.` when there are none; otherwise `{n} dividers` (singular for 1).
- When `hidden > 0`: `{hidden} hidden: they don't fit at this size.` in the existing warning style.
- **Remove all**, shown when the saved list is non-empty; writes `printDividers: []`.

Part entry in `parts.ts`: title `Dividers`, keywords `divider compartment section organizer insert`. Follow the shape of the `shell` entry.

- [ ] **Step 1: Write the failing tests**: in `test/parts.test.ts`, the `3d-snap-box` list includes `'print-dividers'` after `'shell'`, the `finger-organizer` list still includes `'dividers'` and not `'print-dividers'`, and `partForMesh('divider', '3d-snap-box')` is `'print-dividers'`. In `test/sections.test.ts`, follow the file's existing pattern to assert `SECTION_COMPONENTS['print-dividers']` exists.
- [ ] **Step 2: Run** `npx vitest run test/parts.test.ts test/sections.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the part entry, the mapping, and the section.
- [ ] **Step 4: Run** `npm test && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Printed box dividers: inspector section"`

---

### Task 6: Editing state, undo, and hotkeys

**Files:**
- Create: `src/ui/dividerHistory.ts`, `src/ui/useDividerEditing.ts`
- Modify: `src/App.tsx`
- Test: `test/dividerHistory.test.ts`

**Interfaces:**
- Produces:

```ts
// dividerHistory.ts
export interface DividerHistory { past: PrintDivider[][]; future: PrintDivider[][] }
export const EMPTY_HISTORY: DividerHistory;
export const HISTORY_LIMIT = 100;
/** Records `before` as an undo step and clears redo. */
export function pushHistory(h: DividerHistory, before: PrintDivider[]): DividerHistory;
export function undoHistory(h: DividerHistory, current: PrintDivider[]): { history: DividerHistory; layout: PrintDivider[] } | null;
export function redoHistory(h: DividerHistory, current: PrintDivider[]): { history: DividerHistory; layout: PrintDivider[] } | null;
export function isTypingTarget(target: EventTarget | null): boolean;
export type DividerHotkey = 'flip' | 'delete' | 'escape' | 'undo' | 'redo';
/** Null when the key isn't ours or the user is typing. */
export function dividerHotkey(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'target'>): DividerHotkey | null;

// useDividerEditing.ts
export type DividerTool = 'place' | 'move';
export interface DividerEditing {
  tool: DividerTool | null;
  setTool: (tool: DividerTool | null) => void;
  axis: 'x' | 'y';
  flipAxis: () => void;
  layout: PrintDivider[];
  space: DividerSpace;
  selectedId: string | null;
  select: (id: string | null) => void;
  preview: (point: { x: number; y: number }) => DividerPreview | null;
  place: (point: { x: number; y: number }) => void;
  /** One undo step per drag: begin once, drag many times. */
  beginDrag: (id: string) => void;
  dragTo: (rawPos: number) => void;
  setClear: (id: string, side: 'before' | 'after', clearMm: number) => void;
  remove: (id: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}
export function useDividerEditing(params: BoxParameters, setParams: React.Dispatch<React.SetStateAction<BoxParameters>>, model: GeneratedBoxModel): DividerEditing | null;
```

Behavior the signature leaves open:

- The hook returns `null` unless `params.templateId === '3d-snap-box'`.
- `layout` and `space` come from `resolveDividers` with `model.innerDims` and `computePrintBoxDims(...).rIn`.
- Every edit writes `printDividers` (the resolved layout after the edit) and `printDividersBasis: { w: space.w, d: space.d }` in one `setParams` call. This drops hidden dividers from the saved list, which is intended: an edit commits what is on screen.
- New ids: `d-` plus a counter and `Date.now()`, as `newArtworkId` does in `App.tsx`.
- History resets when `templateId` changes or a project loads (the saved list is replaced from outside: detect by comparing against the last layout the hook wrote).
- Hotkeys are bound on `window` only while `tool !== null`: `R` flips, `Delete`/`Backspace` removes the selection, `Escape` clears the selection or, with none, the tool, `Cmd/Ctrl+Z` undoes, `Shift+Cmd/Ctrl+Z` redoes. Call `preventDefault` for handled keys.
- Changing the tool clears the selection.
- In `App.tsx`: call the hook once, pass the result to `Stage` as `dividerEditing` (Task 7 consumes it), and when a tool turns on, set `selectedPart` to `'print-dividers'`.

- [ ] **Step 1: Write the failing tests** in `test/dividerHistory.test.ts`

```ts
const A = [{ id: 'a', axis: 'y' as const, pos: 10, from: 0, to: 60 }];
const B = [...A, { id: 'b', axis: 'y' as const, pos: 30, from: 0, to: 60 }];
it('undoes and redoes', () => {
  const h = pushHistory(EMPTY_HISTORY, A);
  const u = undoHistory(h, B)!;
  expect(u.layout).toBe(A);
  expect(redoHistory(u.history, A)!.layout).toBe(B);
});
it('returns null with nothing to undo or redo', () => {
  expect(undoHistory(EMPTY_HISTORY, A)).toBeNull();
  expect(redoHistory(EMPTY_HISTORY, A)).toBeNull();
});
it('a new edit clears redo', () => {
  const u = undoHistory(pushHistory(EMPTY_HISTORY, A), B)!;
  expect(redoHistory(pushHistory(u.history, A), B)).toBeNull();
});
it('keeps at most 100 steps', () => {
  let h = EMPTY_HISTORY;
  for (let i = 0; i < 150; i++) h = pushHistory(h, A);
  expect(h.past).toHaveLength(HISTORY_LIMIT);
});
const key = (key: string, extra: object = {}, target: unknown = null) =>
  dividerHotkey({ key, metaKey: false, ctrlKey: false, shiftKey: false, target: target as EventTarget, ...extra });
it('maps the hotkeys', () => {
  expect(key('r')).toBe('flip'); expect(key('R')).toBe('flip');
  expect(key('Delete')).toBe('delete'); expect(key('Backspace')).toBe('delete');
  expect(key('Escape')).toBe('escape');
  expect(key('z', { metaKey: true })).toBe('undo'); expect(key('z', { ctrlKey: true })).toBe('undo');
  expect(key('z', { metaKey: true, shiftKey: true })).toBe('redo');
  expect(key('z')).toBeNull(); expect(key('r', { metaKey: true })).toBeNull(); expect(key('x')).toBeNull();
});
it.each(['INPUT', 'TEXTAREA', 'SELECT'])('ignores every hotkey while typing in a %s', (tagName) => {
  const target = { tagName, isContentEditable: false };
  for (const k of ['r', 'Delete', 'Backspace', 'Escape']) expect(key(k, {}, target)).toBeNull();
  expect(key('z', { metaKey: true }, target)).toBeNull();
});
it('ignores hotkeys in contenteditable', () => {
  expect(key('Delete', {}, { tagName: 'DIV', isContentEditable: true })).toBeNull();
});
```

- [ ] **Step 2: Run** `npx vitest run test/dividerHistory.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `dividerHistory.ts`. `isTypingTarget` reads `tagName` and `isContentEditable` off the target without `instanceof`, so it runs in Vitest's node environment.
- [ ] **Step 4: Implement** `useDividerEditing.ts` and wire it into `App.tsx`.
- [ ] **Step 5: Run** `npm test && npm run build`. Expected: PASS.
- [ ] **Step 6: Commit** `git add -A && git commit -m "Printed box dividers: editing state, undo, and hotkeys"`

---

### Task 7: The 2D tool

**Files:**
- Create: `src/ui/DividerToolbar.tsx`, `src/components/DividerOverlay2D.tsx`
- Modify: `src/ui/Stage.tsx`, `src/components/Viewport2D.tsx`, `src/ui/app.css` (or `viewport2d.css`), `README.md`

**Interfaces:**
- Consumes: `DividerEditing` from Task 6; `clearSizes` from Task 3.
- Produces: `Stage` and `Viewport2D` accept `dividerEditing?: DividerEditing | null`. `DividerToolbar` takes `{ editing: DividerEditing; onPickTool: (tool: DividerTool | null) => void }`.

**Toolbar** (`DividerToolbar`): a second floating group on the stage, styled like `.stage-pill`, shown only when `dividerEditing` is not null. Buttons with `lucide-react` icons and visible labels: **Divider** and **Move** (toggle buttons with `aria-pressed`; pressing the active one turns the tool off), **Flip direction** (enabled with the Divider tool; its `title` names the `R` key), **Undo**, **Redo** (disabled per `canUndo` / `canRedo`), and, when a divider is selected, **Delete**.

**View switch (step 1 only):** when a tool turns on and the stage shows only 3D, `Stage` switches to `'split'`, or to `'2d'` on a phone. Mark this with a comment naming Task 8, which removes it.

**Overlay** (`DividerOverlay2D`): rendered inside the `Viewport2D` SVG, as a child of the group that places the `base-3d-plan` panel, translated by the panel's `safeRect.x`, `safeRect.y` so its coordinates are the interior frame. Convert pointer events with `overlayGroup.getScreenCTM().inverse()`, so pan, zoom, and a quarter-turned panel need no special handling.

- A transparent rect over the interior catches pointer events only while a tool is active.
- **Divider tool:** pointer move sets the preview: a dashed rect in the stage accent at the divider's footprint, plus the two clear sizes as text centered in each section, formatted with the display unit as the rest of the view does. Pointer leave clears it. Click places. With `pointerType === 'touch'`: press and slide updates the preview, release places.
- **Move tool:** each divider gets a wide transparent hit rect. Hover highlights the divider in the accent and sets the resize cursor for its axis. Pointer down selects it and calls `beginDrag`; moves call `dragTo` with the interior coordinate on its perpendicular axis; pointer capture goes on the hit rect. A press on empty space clears the selection.
- **Selected divider:** drawn in the accent. Two `NumberField`s float beside the plan (HTML, positioned over the stage, not inside the SVG), labeled **Left** / **Right** for an `axis: 'y'` divider and **Front** / **Back** for `axis: 'x'`, showing `clearSizes` and calling `setClear`.
- While a tool is active, the overlay's handlers stop propagation so the sheet's pan and artwork picking don't also fire. With no tool active, the overlay renders nothing interactive and the 2D view behaves as before.

- [ ] **Step 1: Build the toolbar and wire it through `Stage`.** Run `npm run build`. Expected: no type errors.
- [ ] **Step 2: Build the overlay and mount it in `Viewport2D`.** `Viewport2D` is memoised: confirm the `dividerEditing` object's identity changes when its state does, or the overlay won't update.
- [ ] **Step 3: Verify in the running app.** Start the dev server (`npm run dev`), pick the 3D-printed snap box, and check each line:
  - The toolbar appears for the printed box and for no other box type.
  - **Divider**: the dashed preview follows the pointer, stops at walls and dividers, shows two sizes, and disappears within 5 mm of a wall. Click places; the divider appears in 3D and in the plan.
  - `R` and **Flip direction** switch direction.
  - **Move**: hover highlights; drag slides in 1 mm steps; attached dividers stretch; the slide stops at each limit.
  - Typing `50` in a size field gives a 50.0 mm clear section.
  - `Delete` removes the selected divider and its dependents grow. `Cmd+Z` and `Shift+Cmd+Z` step back and forward; one drag is one step.
  - Typing in an inspector number field with a tool active doesn't flip, delete, or undo.
  - Save the project, start a new one, open the file: the layout returns.
  - Change the box width: dividers keep their proportions. Shrink it until the inspector reports hidden dividers; grow it back and they return.
  - Download the base STL and confirm it contains the dividers (open it in a slicer, or check the triangle count rose by 12 per divider).
  - At phone width (375 px): picking **Divider** switches to the 2D view, and press-slide-release places a divider.
  - Laser box types: the 2D view pans, zooms, and selects artwork as before.
- [ ] **Step 4: Update `README.md`**: under the 3D-printed enclosure bullet, add that the box takes freeform dividers placed and dragged in the preview.
- [ ] **Step 5: Run** `npm test && npm run build`. Expected: PASS.
- [ ] **Step 6: Commit** `git add -A && git commit -m "Printed box dividers: the 2D divider and move tools"`

Step 1 of the spec ends here. The feature is usable and shippable at this commit.

---

### Task 8: The 3D tool

**Files:**
- Modify: `src/components/Viewport3D.tsx`, `src/ui/Stage.tsx`
- Create: `src/engine/dividerPick.ts`
- Test: `test/dividerPick.test.ts`

**Interfaces:**
- Consumes: `DividerEditing`; `PrintWorldPiece.dividerId` from Task 4.
- Produces:

```ts
// dividerPick.ts: pure, no DOM
/** World y of the base's inside floor. */
export function floorWorldY(dims: PrintBoxDims): number;                  // -(baseH + lidH) / 2 + floor
/** World point on the floor plane -> interior frame. */
export function worldToInterior(dims: PrintBoxDims, world: { x: number; z: number }): { x: number; y: number }; // x + innerW/2, innerD/2 - z
export function interiorToWorld(dims: PrintBoxDims, p: { x: number; y: number }): { x: number; z: number };
```

`Viewport3D` accepts `dividerEditing?: DividerEditing | null`.

Behavior:

- **One mesh per divider.** In the 3D-print branch that groups world pieces by `partId`, build each divider piece as its own mesh with `userData.dividerId`, on the base panel's group.
- **Lid.** While `tool !== null`, hide the lid panel's group (`visible = false`) and restore it when the tool turns off. Don't touch `assemblyProgress`.
- **Floor point.** Raycast the pointer against `new THREE.Plane((0, 1, 0), -floorWorldY)`, undo the base group's current transform (it moves when exploded), and convert with `worldToInterior`.
- **Divider tool.** Pointer move shows a translucent accent box at the previewed divider, at the resolved thickness and height, or nothing when the preview is null. A click (the existing under-5-px test) places. With `pointerType === 'touch'`, a tap places directly with no hover preview.
- **Hover and drag.** With either tool active, a pointer move raycasts the divider meshes first; the nearest hit is highlighted with the accent emissive. A pointer down on a highlighted divider selects it, calls `beginDrag`, sets `controls.enabled = false`, and captures the pointer; moves call `dragTo` with the floor point's perpendicular coordinate; pointer up re-enables the controls. A pointer down anywhere else is left to `OrbitControls`. A click on a divider selects it without moving it.
- With a tool active, a click on the floor or a divider doesn't also fire the existing part selection.
- Read the latest `dividerEditing` through the same ref pattern as `callbacksRef`; the pointer handlers are bound once.
- Remove Task 7's forced switch away from the 3D view.

- [ ] **Step 1: Write the failing tests** in `test/dividerPick.test.ts`

```ts
const d = computePrintBoxDims({ ...DEFAULT_BOX_PARAMETERS, category: '3d-print', templateId: '3d-snap-box' }, 110, 80, 55);
it('puts the floor on top of the base plate', () => {
  expect(floorWorldY(d)).toBeCloseTo(-(d.baseH + d.lidH) / 2 + d.floor);
});
it('maps the front-left inner corner to the interior origin', () => {
  expect(worldToInterior(d, { x: -55, z: 40 })).toEqual({ x: 0, y: 0 });
  expect(worldToInterior(d, { x: 55, z: -40 })).toEqual({ x: 110, y: 80 });
});
it('round-trips', () => {
  const w = interiorToWorld(d, { x: 30, y: 12 });
  expect(worldToInterior(d, w)).toEqual({ x: 30, y: 12 });
});
it('agrees with the print-to-world transform', () => {
  // A divider at interior x = 30 must sit under the same world x as its mesh from
  // buildPrintPartWorldGeometry: compare the mesh's bounding-box center to interiorToWorld.
});
```

Write the body of the last test using a model with one divider.

- [ ] **Step 2: Run** `npx vitest run test/dividerPick.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `dividerPick.ts`, then the `Viewport3D` behavior above.
- [ ] **Step 4: Verify in the running app**, in the 3D view alone:
  - Picking **Divider** hides the lid; turning the tool off brings it back.
  - The translucent preview tracks the pointer across the floor at any camera angle and matches the 2D preview in split view.
  - Click places. Hovering a divider highlights it; dragging it slides it and the camera stays still; dragging anywhere else orbits.
  - `Delete`, undo, and redo work as in 2D.
  - With the box exploded (fold slider at 0%), placement still lands under the pointer.
  - At phone width with touch emulation: tap places, drag on a divider moves it, drag elsewhere orbits, and the **Delete** button removes the selection.
- [ ] **Step 5: Run** `npm test && npm run build`. Expected: PASS.
- [ ] **Step 6: Commit** `git add -A && git commit -m "Printed box dividers: place and drag in the 3D view"`
