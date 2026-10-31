# Wine Carrier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new wood box type, the wine carrier, in Kerfuffle and the Atomm generator: a tall
tab-and-slot box sized from a bottle, whose front and back bend over living-hinge shoulders into
handle halves that lock into flexing, keyholed ears on the side pieces.

**Architecture:** The geometry lives in Kerfuffle's engine as one new module (`wineCarrier.ts`)
that builds flat pieces and their 3D transforms, plus two reusable helpers: tab-and-slot joinery
(`tabSlot.ts`) and a general bent-panel builder for 3D (`bentPanel.ts`). Panels that bend carry
their bend profile on `Panel3DTransform`, so both 3D viewers (Kerfuffle's `Viewport3D` and the
generator's `view3d`) build them through one shared function. The generator gets the type through
the `kerfuffle` submodule and adds a card for its settings.

**Tech Stack:** TypeScript, three.js 0.170, clipper2-js (through `src/engine/geom.ts`), Vitest,
React (Kerfuffle UI), vanilla TS (generator).

**Spec:** `docs/superpowers/specs/2026-10-31-wine-carrier-design.md` (read it first; this plan
argues from it).

## Global Constraints

- Template id `finger-wine-carrier`, category `wood-finger`, box type name **Wine carrier**.
- Tab-and-slot joinery for this type; no corner finger joints. No tabs or slots on the taper.
- Front and back: rectangular, rounded handle tops, rounded handle cutout; four living-hinge
  bends; the halves meet face to face.
- Side pieces taper fully to meet the joined handle halves and rise into ears.
- Handle tabs are hooked and lock into keyhole slots, one per ear, both tabs stacked.
- Ears flex outward on an oval patch of hinge slits.
- Every touchable edge rounded (handle tops and corners, handle cutout, ear tops, keyhole, hooked
  tabs). Hidden joint faces stay square.
- Shoulder and ear hinges flex on every opening: their defaults keep a 1.5× bend-radius margin.
- Sized from a bottle preset or custom diameter and height, plus clearance.
- Exports follow each app's existing rules (Atomm: cuts `#FE0002`, score and engrave `#2366FF`).
- Works with material sheets, the kerf offset, face patterns (with crop), text and artwork.

## Review Focus

1. **A half bottle (375 ml, Ø 66 mm)**: the narrow box must still fit the ear, keyhole and oval
   patch; expect them to scale down, not overlap or vanish. Test in Task 3.
2. **6 mm material**: the stacked tabs are 12 mm thick; the keyhole, hook and ear must grow with
   the thickness. Test in Task 3.
3. **A custom bottle shorter than its shoulder height, or a shoulder height set below the
   minimum**: expect the shoulder clamped to the minimum that clears the neck, and a note saying
   so, never an error. Test in Task 1.
4. **A magnum on a small bed**: the 400+ mm front won't fit a 385 × 300 bed; expect the existing
   split onto bed-sized sheets, or the "bigger than the sheet" warning. Test in Task 3.
5. **Kerf offset 0 and 0.3 mm**: slots shrink by the kerf so tabs friction-fit; at 0 they match
   exactly. Test in Task 2.

---

## File structure

- Create `src/engine/wineBottles.ts`: bottle presets and the carrier's layout maths (sizes,
  shoulder profile). Pure numbers, no geometry.
- Create `src/engine/tabSlot.ts`: tabs along an edge and the matching slots in a face.
- Create `src/engine/wineCarrier.ts`: the carrier's pieces (2D outlines, paths, 3D transforms).
- Create `src/engine/bentPanel.ts`: a flat panel bent along a profile, as three.js geometry.
- Modify `src/engine/types.ts`, `presets.ts`, `fingerJointEngine.ts` (dispatch),
  `boxGenerator.ts` (inner dims from the bottle), `scene3d.ts` (shared bent-panel hookup).
- Modify Kerfuffle UI: `src/ui/boxTypes.ts`, `src/ui/parts.ts`, new
  `src/ui/sections/WineCarrierSection.tsx`, `src/ui/sections/LivingHingeSection.tsx`,
  `src/components/Viewport3D.tsx`.
- Modify the generator: `finger-joint-box/src/params.ts`, `main.ts`, `textArt.ts`, `view3d.ts`.
- Tests: `test/wineBottles.test.ts`, `test/tabSlot.test.ts`, `test/wineCarrier.test.ts`,
  `test/bentPanel.test.ts` in Kerfuffle; the generator's `test/atommSvg.test.ts` covers the new
  type through its loop over wood types.

---

### Task 1: Bottle presets and the carrier's layout

**Files:**
- Create: `src/engine/wineBottles.ts`
- Modify: `src/engine/types.ts` (params), `src/engine/presets.ts` (defaults, template entry)
- Test: `test/wineBottles.test.ts`

**Interfaces:**
- Produces:
  - `BoxTemplateId` gains `'finger-wine-carrier'`.
  - `BoxParameters` gains `wineBottleId: string` (a preset id or `'custom'`),
    `wineBottleDiameterMm`, `wineBottleHeightMm`, `wineBottleShoulderMm` (height where the
    bottle's shoulder starts), `wineClearanceMm`, `wineShoulderHeightMm` (0 = automatic),
    `wineFeet: boolean`.
  - Defaults: `bordeaux-750`, 76, 300, 210, clearance 4, shoulder 0, feet true.
  - `interface WineBottle { id: string; name: string; diameterMm: number; heightMm: number; shoulderMm: number }`
  - `const WINE_BOTTLES: WineBottle[]`, in this order:
    `bordeaux-750` "Bordeaux 750 ml" 76/300/210, `burgundy-750` "Burgundy 750 ml" 82/300/190,
    `champagne-750` "Champagne 750 ml" 90/310/200, `riesling-750` "Riesling flute 750 ml"
    74/350/230, `half-375` "Half bottle 375 ml" 66/240/170, `magnum-1500` "Magnum 1.5 l"
    100/350/245.
  - `interface WineCarrierLayout { innerSideMm; bodyHeightMm; shoulderHeightMm; minShoulderHeightMm; shoulderClamped: boolean; handleHeightMm; bendRadiusMm; bendAngleRad; slopeLengthMm; insetMm; neckClearanceMm }`
  - `function wineCarrierLayout(p: BoxParameters): WineCarrierLayout`
  - `function shoulderProfile(insetMm: number, heightMm: number, radiusMm: number): { angleRad: number; slopeMm: number } | null`

Definitions (all in mm, mid-thickness):
- `innerSideMm` S = diameter + 2 × clearance (width = depth = S).
- `bodyHeightMm` = shoulderMm + clearance.
- `insetMm` = S / 2 (each half's mid-surface moves from ±(S/2 + T/2) to ±T/2).
- `handleHeightMm` = 70.
- `bendRadiusMm` R = max(10, 1.5 × `hingeBendRadiusMm(livingHingeSettings(p), T, kerf, S)`).
- `shoulderProfile`: two arcs of radius R and angle α with a straight slope L between, so
  inset = 2R(1 − cos α) + L sin α and height = 2R sin α + L cos α. Solve α by bisection on
  (0, π/2) with L = (height − 2R sin α) / cos α ≥ 0; null when no α works.
- `minShoulderHeightMm`: the least height whose profile exists and whose taper, at the bottle's
  top, leaves at least `neckClearanceMm` = 17 (a 30 mm capsule's radius plus 2) between the
  inside faces and the centre line.
- `shoulderHeightMm` = max(min, the set value), `shoulderClamped` when the set value was raised.

- [ ] **Step 1: Write the failing tests** in `test/wineBottles.test.ts`:
  - `it('lists the six bottles in order')`: ids equal the list above.
  - `it('sizes the box from the bottle')`: Bordeaux defaults → `innerSideMm` 84,
    `bodyHeightMm` 214.
  - `it('solves a shoulder profile that meets its inset and height')`: for inset 42, height 90,
    R 12, recompute inset and height from the result to within 0.01.
  - `it('returns no profile when the shoulder is too short')`: inset 42, height 20, R 12 → null.
  - `it('clamps a shoulder below the minimum and says so')`: `wineShoulderHeightMm` 10 →
    `shoulderClamped` true and `shoulderHeightMm` equals `minShoulderHeightMm`.
  - `it('clears the neck at the bottle top')`: for every bottle, the inside half-gap at the
    bottle's height ≥ 17.
  - `it('never errors on a bottle shorter than its shoulder')`: custom height 150, shoulder
    210 → a layout with finite numbers.
- [ ] **Step 2: Run** `npx vitest run test/wineBottles.test.ts`; expect FAIL (module missing).
- [ ] **Step 3: Implement** the types, defaults, template entry (`BOX_TEMPLATES` id
  `finger-wine-carrier`, name "Wine carrier with a locking handle", short name "Wine carrier",
  category `wood-finger`) and `wineBottles.ts`.
- [ ] **Step 4: Run** the test file; expect PASS. Run `npx tsc --noEmit -p .`; expect clean.
- [ ] **Step 5: Commit** `git commit -m "Wine carrier: bottle presets and the carrier's layout"`.

### Task 2: Tab-and-slot joinery

**Files:**
- Create: `src/engine/tabSlot.ts`
- Test: `test/tabSlot.test.ts`

**Interfaces:**
- Produces:
  - `interface TabRun { fromMm: number; toMm: number; count: number; tabMm: number }`: tabs
    spaced evenly along an edge segment.
  - `function tabCentres(run: TabRun): number[]`
  - `function tabbedEdge(a: Point2D, b: Point2D, run: TabRun, depthMm: number, outward: 1 | -1): Point2D[]`:
    the edge from a to b with rectangular tabs `depthMm` out, square-cornered (hidden faces).
  - `function slotsFor(run: TabRun, lineOffsetMm: number, thicknessMm: number, kerfMm: number, alongX: boolean): Point2D[][]`:
    one closed rectangle per tab, each `tabMm − kerf` long and `thickness − kerf` wide, centred
    on its tab, on the line `lineOffsetMm` in from the face's edge.
  - Tab count rule used by the carrier: `count = max(2, round(lengthMm / 45))`, `tabMm = 12`.

- [ ] **Step 1: Write the failing tests**:
  - `it('centres tabs evenly in their run')`: 0–100, 2 tabs → centres 25 and 75.
  - `it('lines every slot up with its tab')`: slot centres equal tab centres.
  - `it('shrinks slots by the kerf so tabs friction-fit')`: kerf 0.3, tab 12, T 3 → slot
    11.7 × 2.7; kerf 0 → 12 × 3.
  - `it('keeps the edge closed and square')`: `tabbedEdge` starts at a, ends at b, every turn
    is 90°.
- [ ] **Step 2: Run** `npx vitest run test/tabSlot.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** `tabSlot.ts`.
- [ ] **Step 4: Run**; expect PASS.
- [ ] **Step 5: Commit** `git commit -m "Engine: tab-and-slot joinery"`.

### Task 3: The carrier's flat pieces

**Files:**
- Create: `src/engine/wineCarrier.ts`
- Modify: `src/engine/fingerJointEngine.ts` (dispatch in `generateWoodFingerBox`),
  `src/engine/boxGenerator.ts` (inner dims for this template come from `wineCarrierLayout`)
- Test: `test/wineCarrier.test.ts`

**Interfaces:**
- Consumes: `wineCarrierLayout`, `tabSlot.ts`, `hingeCuts` and `livingHingeSettings`,
  `geom.offset`/`intersect`/`union`, `shapes.buildShape` (ellipse, pill, rounded).
- Produces:
  - `function generateWineCarrier(params: BoxParameters): { panels2D: BoxPanel2D[]; panels3D: Panel3DTransform[]; fingerCountSummary: string }`
  - Piece ids: `front`, `back`, `left`, `right`, `bottom`.
  - `function roundOutline(poly: Poly, radiusMm: number): Poly`: rounds every convex and
    concave corner by offsetting in and back out, then out and back in.
  - `const HOOK = { notchMm: 8, hookMm: 3, reachMm: 4 }` (tab height in the slit, how far the
    hook hangs below it, how far past the ear's outer face it reaches).

Piece geometry (2D, y up the piece from its foot; T = thickness):
- **Front/back**: width S + 2T across the body; above the body, S across (the handle halves sit
  between the ears). Flat length = body + R·α + L + R·α + handle. Hinge slits (`hingeCuts`) fill
  each R·α zone across the full width. Handle top: corners rounded r 10. Handle cutout: a pill
  min(S − 24, 90) × 28, its centre 30 below the top. Each handle side edge carries one hooked tab
  at mid-height of the handle zone: length T + `HOOK.reachMm`, height `HOOK.notchMm` through the
  ear, and `notchMm + hookMm` beyond it (the hook hangs down); corners rounded r 1. Body side
  edges carry slots for the side pieces' tabs (`slotsFor`, line T/2 in). Bottom edge: an arch
  cutout when `wineFeet` (width 0.6·S, height 8, rounded), with the bottom's slots above it.
  `safeRect` is the body only, inset 6 from its edges and above the feet.
- **Sides**: the body's S wide plus tabs (length T) on both vertical body edges; above the body,
  the outline follows the front and back's inside face along the shoulder profile (no tabs);
  then the ear, 2T + 16 wide centred, up to 12 below the handle top, its top a semicircle. In the
  ear: the keyhole (a slit 2T + kerf-adjusted wide and `notchMm` tall at the tabs' height, under
  a circle of diameter hypot(2T, notchMm + hookMm) + 1 joined to it) and the oval patch (hinge
  slits clipped to an ellipse ear-width − 4 by 20, centred 10 above the taper's top, slits running
  across the ear). `safeRect` is the body only.
- **Bottom**: S × S with tabs on all four edges into the walls' bottom slots.

- [ ] **Step 1: Write the failing tests** in `test/wineCarrier.test.ts`:
  - `it('makes five pieces')`: ids front, back, left, right, bottom.
  - `it('unrolls the front to the body, both bends, the slope and the handle')`: front height
    equals `bodyHeightMm + 2·R·α + slopeLengthMm + handleHeightMm` within 0.01.
  - `it('puts hinge slits only in the bend zones')`: every hinge cut's y lies inside one of the
    two zones.
  - `it('lines up every side tab with a front and back slot')`: tab centres equal slot centres.
  - `it('has no tabs or slots on the taper')`: no side-piece tab and no front slot above
    `bodyHeightMm`.
  - `it('passes a raised hook through the keyhole and catches it lowered')`: the tab's cross-
    section (2T by notch + hook) raised by `hookMm` lies inside the keyhole; lowered, its notch
    part lies inside the slit and its hook lies below the slit's bottom edge.
  - `it('rounds every touchable corner')`: in the handle zone and ear, no outline vertex turns
    through more than 30° (sharp corners would be one vertex turning 90°).
  - `it('fits the ear features on a half bottle and in 6 mm wood')`: for `half-375` and for
    T 6, the keyhole and the oval patch lie inside the ear and don't overlap.
  - `it('keeps patterns to the body')`: `safeRect` of front and sides ends below
    `bodyHeightMm`.
  - `it('splits a magnum front onto sheets when the bed is small')`: a magnum carrier on the
    385 × 300 bed reports `fitsOnBed` false and more than one sheet, or names the front as
    bigger than the sheet.
- [ ] **Step 2: Run** `npx vitest run test/wineCarrier.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** `wineCarrier.ts`, the dispatch (`templateId === 'finger-wine-carrier'`
  → `generateWineCarrier`), and the inner dims (width = depth = `innerSideMm`, height = total
  outside height). Give each piece's 3D transform its closed position; front and back also get
  `bend` (Task 4 defines it; leave it out until then).
- [ ] **Step 4: Run** the file and the whole suite (`npx vitest run`); expect PASS, including
  the existing pattern, sheet and export tests for the new type.
- [ ] **Step 5: Commit** `git commit -m "Wine carrier: the flat pieces"`.

### Task 4: Bent panels in 3D

**Files:**
- Create: `src/engine/bentPanel.ts`
- Modify: `src/engine/types.ts` (`Panel3DTransform.bend`), `src/engine/wineCarrier.ts`,
  `src/engine/scene3d.ts`
- Test: `test/bentPanel.test.ts`

**Interfaces:**
- Produces:
  - `type BendSegment = { kind: 'straight'; lengthMm: number } | { kind: 'arc'; radiusMm: number; angleRad: number }`
  - `Panel3DTransform.bend?: { segments: BendSegment[]; flip?: boolean }`: the profile up the
    panel's flat y, bending about the panel's x axis; positive angles bend toward the box's inside.
  - `function bentPoint(segments: BendSegment[], s: number, d: number): { y: number; z: number }`:
    where the point `s` along the mid-surface and `d` off it lands.
  - `function buildBentPanelGeometry(spec: Panel3DTransform): THREE.BufferGeometry`: the flat
    outline and holes, cut into bands (2 mm in arcs, whole straights) with clipper, each band
    extruded and its vertices moved by `bentPoint`; face and side groups as
    `mergeBufferGeometries` makes them.
  - `function buildBentLines(spec: Panel3DTransform, paths: Point2D[][]): THREE.LineSegments`:
    hinge slits drawn on the bent surface.
- Algorithm note: earcut puts no vertices inside a band, so bands must be thin across the arcs
  for the warp to follow the curve; that's why the flat shape is banded before extruding.

- [ ] **Step 1: Write the failing tests**:
  - `it('keeps lengths along the mid-surface')`: a straight-arc-straight profile; distance
    along the bent mid-surface between s = 0 and s = total equals the flat length within 0.5%.
  - `it('lands a carrier half where the layout says')`: for Bordeaux defaults, the handle's
    mid-surface ends at z = T/2 and the body's at z = S/2 + T/2, within 0.2.
  - `it('bends a flat panel with no seams')`: `buildBentPanelGeometry` on a 50 × 200 strip with
    one 90° arc gives a bounding box 50 wide and the expected height and depth within 0.5.
- [ ] **Step 2: Run** `npx vitest run test/bentPanel.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** `bentPanel.ts`; give the carrier's front and back their `bend`
  (body straight, arc α inward, slope L, arc α outward, handle straight); in `scene3d.ts`, export
  a `panelGeometryFor(model, spec)` that returns `buildBentPanelGeometry(spec)` when `spec.bend`
  is set (the hinge lid and extrusions as today otherwise).
- [ ] **Step 4: Run**; expect PASS.
- [ ] **Step 5: Commit** `git commit -m "Engine: panels bent along a profile, in 3D"`.

### Task 5: Bend checks and notes

**Files:**
- Modify: `src/engine/wineBottles.ts`
- Test: `test/wineBottles.test.ts`

**Interfaces:**
- Produces: `function wineCarrierChecks(p: BoxParameters): { shoulderBendMm: number; earBendMm: number; webMm: number; shoulderCracks: boolean; earCracks: boolean; thinWeb: boolean; notes: string[] }`
  - Cracks when the hinge's achievable radius × 1.5 exceeds the radius asked of it (shoulder:
    R; ear: 25). `thinWeb` when `hingeMinWebMm` < `MIN_SAFE_WEB_MM`.
  - Notes, verbatim:
    - "The shoulders open and close each time; at these settings they may crack. Move the hinge
      rows closer or lengthen the slits."
    - "The ears flex each time you open it; at these settings they may crack. Move the hinge
      rows closer or lengthen the slits."
    - "Shoulders raised to {min} so the taper clears the bottle's neck." (when clamped)

- [ ] **Step 1: Write the failing tests**: defaults → no cracks and no notes; pitch 6, slit 10,
  bridge 6 → `shoulderCracks` true with its note; shoulder 10 → the clamp note.
- [ ] **Step 2: Run**; expect FAIL. **Step 3: Implement.** **Step 4: Run**; expect PASS.
- [ ] **Step 5: Commit** `git commit -m "Wine carrier: bend checks and notes"`.

### Task 6: Kerfuffle's UI and 3D view

**Files:**
- Modify: `src/ui/boxTypes.ts` (entry `{ id: 'finger-wine-carrier', templateId: 'finger-wine-carrier', name: 'Wine carrier', blurb: 'A bottle carrier with a locking handle', params: {} }` and a thumbnail pose drawing the closed carrier), `src/ui/parts.ts` (`'finger-wine-carrier': ['wine', 'material', 'living-hinge', ...PATTERN_TAIL]`),
  `src/ui/sections/LivingHingeSection.tsx` (pattern, row spacing, slit, bridge, the bend note;
  not the back, finger hole or guides for this type), `src/components/Viewport3D.tsx` (use
  `panelGeometryFor`)
- Create: `src/ui/sections/WineCarrierSection.tsx`: **Bottle** select (the six presets and
  Custom), **Diameter** and **Height** (custom only; picking a preset fills them), **Clearance**,
  **Shoulder height** (Auto or a value), **Feet** switch, and Task 5's notes.
- Test: `test/sections.test.ts`

- [ ] **Step 1: Write the failing test**: the carrier's sections are wine, material,
  living-hinge and the pattern tail; picking Magnum sets diameter 100 and height 350.
- [ ] **Step 2: Run**; expect FAIL. **Step 3: Implement.** **Step 4: Run** the suite and
  `npm run build`; expect PASS and a clean build.
- [ ] **Step 5: Check in the browser** (`npm run dev`, port 5173): pick Wine carrier; the 3D
  view shows the closed carrier with bent shoulders, the handles meeting and the hooks in the
  ears; the 2D sheet shows five pieces with hinge slits only in the bends; a pattern with an oval
  crop on a side stays on the body.
- [ ] **Step 6: Commit** `git commit -m "Wine carrier in Kerfuffle"`.

### Task 7: The Atomm generator

**Files (in `/Users/aellis/Projects/Personal/finger-joint-box`):**
- Move the `kerfuffle` submodule to the commit from Task 6.
- Modify: `src/params.ts` (a **Wine carrier** card shown for the type, with Task 6's fields;
  the Living hinge card shown for it with pattern, spacing, slit, bridge and bend note only),
  `src/main.ts` (Task 5's notes; carry the bottle settings between box types), `src/textArt.ts`
  (`textFaces` for the carrier: front, back, left, right), `src/view3d.ts` (use
  `panelGeometryFor` for bent panels)
- Test: `test/atommSvg.test.ts` (its loop over wood types now includes the carrier)

- [ ] **Step 1: Run** `npm test`; the carrier's export cases should pass already; fix any that
  don't.
- [ ] **Step 2: Implement** the card, notes, faces and 3D hookup.
- [ ] **Step 3: Run** `npm test` and `npm run build`; expect PASS and a clean build.
- [ ] **Step 4: Check in the browser** (port 5174): the carrier in 2D and 3D, an oval-cropped
  pattern on a side, cut-out stencil text on the front, a magnum split onto material sheets, and
  the exported SVG's colours.
- [ ] **Step 5: Commit** `git commit -m "Wine carrier in the generator"`.
