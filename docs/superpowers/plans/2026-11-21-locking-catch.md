# Locking catch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Catch shape** setting (Tapered, Dovetail, Keyhole, Circle) and a **Lock** setting to the living-hinge box, so the lid's tongue presses into a reverse-shaped notch and locks.

**Architecture:** One profile function, `catchOutline`, draws the tongue (`grow = +kerf/2`) and the notch (`grow = -kerf/2`) from the same `LivingHingeCatch` description, so the notch is always the tongue's reverse. `livingHingeCatch` picks the shape, sizes it, and falls back to Tapered when the front wall is too small. The 2D generator, the 3D scene and the inspector all read that one description.

**Tech Stack:** TypeScript, React, three.js, Vitest (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-21-locking-catch-design.md`

## Global Constraints

- Shapes are exactly `'tapered' | 'dovetail' | 'keyhole' | 'circle'`; the default stays `'tapered'`, so existing projects and presets cut the same sheet as today.
- The only motion is pressing the tongue straight in. No sideways slide, no separate pegs.
- **Lock** is the undercut per side in mm: default 0.4, range 0.1 to 0.8, step 0.05.
- Locking shapes are at least `2T` deep. They use no wear travel (`CATCH_WEAR_TRAVEL_MM` applies to Tapered only).
- All corners stay rounded, using `catchTongueRadii`'s tip and root radii.
- The tongue's width never exceeds 60% of `innerW`. The front wall keeps `FRONT_BELOW_NOTCH_MM` (6 mm) below the notch.
- Fall back to Tapered when the chosen shape doesn't fit, and say so in the inspector.
- Finger hole: Circle and Keyhole get a round hole centered in the head; Dovetail keeps the obround hole. Where the head has no room the hole is dropped with a note.
- `parseProject` drops unknown settings and fills missing ones from defaults, so old `.kerf` files open as Tapered.
- Run tests with `npm test`. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A narrow or short box (for example `innerW` 40, `frontH` 20) with each locking shape: falls back to Tapered with valid geometry and a matching note. Pinned in Task 2.
- Lock at its limits (0.1 and 0.8) on every shape: the undercut holds, the notch's ears keep wood, and no turn exceeds 45 degrees. Pinned in Task 2.
- Kerf 0 and kerf 0.5: the notch is exactly one kerf narrower than the tongue at every depth, and the shapes stay valid polygons. Pinned in Task 3.
- A blank or zero Lock or hole-size field (NumberField can briefly commit 0): the engine falls back to the defaults instead of drawing a degenerate shape. Pinned in Task 2.
- An old `.kerf` file with the finger-hole settings and no shape: opens as Tapered with an unchanged cut sheet. Pinned in Task 1.

---

### Task 1: Settings and defaults

**Files:**
- Modify: `src/engine/types.ts` (near `livingHingeThumbHole`, line ~167)
- Modify: `src/engine/presets.ts` (near line 407)
- Test: `test/livingHinge.test.ts` (new `describe('locking catch settings')`)

**Interfaces:**
- Produces: `export type CatchShapeId = 'tapered' | 'dovetail' | 'keyhole' | 'circle'` and `BoxParameters.livingHingeCatchShape: CatchShapeId`, `BoxParameters.livingHingeCatchLockMm: number`, both in `src/engine/types.ts`. Defaults: `'tapered'` and `0.4`.

- [ ] **Step 1: Write the failing tests**
  - `defaults to the tapered catch with 0.4 mm of lock`: `DEFAULT_BOX_PARAMETERS.livingHingeCatchShape === 'tapered'` and `livingHingeCatchLockMm === 0.4`.
  - `round-trips the catch settings`: `parseProject(serializeProject(...))` keeps `'circle'` and `0.6`.
  - `opens an old file with no catch shape as tapered, cut sheet unchanged`: delete both keys from a serialized project, parse it, and expect the `top` panel's `living-wrap-outline` path `d` to equal the one from `DEFAULT_BOX_PARAMETERS` with `templateId: 'finger-living-hinge'`.
- [ ] **Step 2: Run** `npx vitest run test/livingHinge.test.ts -t "locking catch settings"`. Expected: FAIL (properties missing).
- [ ] **Step 3: Add the type and two `BoxParameters` fields with doc comments, and the two defaults in `presets.ts`.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add src test && git commit -m "Catch shape and lock settings, default tapered"`.

### Task 2: Shape profiles and catch sizing

**Files:**
- Modify: `src/engine/fingerJointEngine.ts` (the catch block, lines ~1957-2042)
- Test: `test/livingHinge.test.ts` (new `describe('catch shapes')`)

**Interfaces:**
- Consumes: `CatchShapeId` and the two settings from Task 1.
- Produces, exported from `fingerJointEngine.ts`:
  - `interface LivingHingeCatch { shape: CatchShapeId; width: number; height: number; neckLen: number; lockMm: number; hole: null | { width: number; height: number; centerY: number }; shrunk: boolean; fellBack: boolean; holeDropped: boolean }`. `shape` is the shape used after fallback; `width` is the widest width before kerf; `height` is the depth from the root line to the tip.
  - `livingHingeCatch(params: BoxParameters, innerW: number, frontH: number): LivingHingeCatch` (replaces today's return type; for `'tapered'` it returns exactly today's `width`, `height`, `hole` and `shrunk`, with `centerY = height / 2`, `neckLen = 0`, `lockMm = 0`, `fellBack = false`, `holeDropped = false`).
  - `catchOutline(c: LivingHingeCatch, grow: number, narrow = 0): Point2D[]`: origin at the root's middle, y toward the tip, starting at the left end of the root line and ending at the right end, mirror-symmetric. Every edge moves out by `grow` and round radii change by `grow`; depth does not change. `narrow` is subtracted from the width (used only for Tapered's wear travel).
- Keep `catchTongueEdge`, `catchTongueRadii`, `CATCH_TAPER_DEG`, `CATCH_WEAR_TRAVEL_MM` and `MIN_THUMB_HOLE_MM` exported and unchanged.

**Geometry (pinned by the spec's calls).** Let `f = root fillet radius` from `catchTongueRadii`, and `u = lockMm` (clamped to 0.1-0.8; a missing or zero value means 0.4). **Lock is measured just below the root fillet:** the shape's width at depth `f` is `width - 2u`.
- Tapered: `catchTongueEdge(width + 2*grow - narrow, height, tipR + grow, rootR - grow, 8, CATCH_TAPER_DEG)`.
- Dovetail: straight sides from depth `f` (width `width - 2u`) leaning out to the start of the tip corners at depth `height - tipR` (width `width`); tip corners rounded; root fillets as Tapered. `height = 2T`, `width` = today's plain width (`min(24, max(10, innerW * 0.24))`).
- Circle: radius `r = D/2`, `D = max(8, 4T)`. The circle's center sits at `cy = f + sqrt(2*r*u - u*u)` below the root line, so the lip edge crosses above the equator and the width at depth `f` is `D - 2u`. `height = cy + r`.
- Keyhole: a straight neck of length `neckLen = T` and width `D - 2u`, then the same circle with its center at `neckLen + sqrt(2*r*u - u*u)`. `height = center + r`.
- Fit and fallback: locking shapes fall back to Tapered (`fellBack = true`) when `width > innerW * 0.6` or `height + FRONT_BELOW_NOTCH_MM > frontH`.
- Finger hole: if `livingHingeThumbHole` is off, no hole. Circle and Keyhole: hole is round, diameter `d = livingHingeThumbHoleWidthMm` (default 16 when blank), `D = max(D0, d + 2*TONGUE_SIDE_MM)`, centered on the head's center (`centerY`); shrink `d` toward `MIN_THUMB_HOLE_MM` until the fit rules pass, and set `shrunk` when it shrank. Dovetail: the obround hole of today's code, tongue grown to `width = holeW + 2*TONGUE_SIDE_MM`, `height = max(2T, holeH + 2*TONGUE_END_MM)`, `centerY = height / 2`. If no hole size fits, drop it (`holeDropped = true`) and keep the plain shape.

- [ ] **Step 1: Write the failing tests** (use the file's `widthAt`; build params as `{ ...DEFAULT_BOX_PARAMETERS, templateId: 'finger-living-hinge', livingHingeCatchShape: s, livingHingeThumbHole: false }`)
  - `tapered shape is unchanged`: `catchOutline(c, 0)` deep-equals `catchTongueEdge(c.width, c.height, tip, root, 8, CATCH_TAPER_DEG)`.
  - `each locking shape is wider at its widest than just below the root fillet by at least 2 x lock` for dovetail, keyhole, circle at Lock 0.1, 0.4, 0.8: `widest - widthAt(edge, f, 0, 1e3) >= 2*u - 1e-3`.
  - `circle's lip edge is above its equator at every Lock`: equator depth `c.height - c.width / 2` is greater than `f`, and `widthAt(edge, equator, 0, 1e3)` is within 1e-6 of `c.width`.
  - `locking shapes are at least 2T deep`.
  - `outline is mirror-symmetric, starts and ends on the root line, and no turn exceeds 45 degrees` for every shape and Lock extreme.
  - `falls back to tapered on a narrow or short box`: `livingHingeCatch(p, 40, 20)` for each locking shape returns `fellBack: true, shape: 'tapered'`, and its outline is a valid simple polygon (finite points, no repeated points).
  - `a blank or zero Lock uses 0.4`.
  - `finger hole`: circle with default hole on `innerW` 110 gives a round hole (`width === height`) centered at `centerY`, with 4 mm of wood all round inside the head; on `innerW` 30 the hole shrinks or is dropped with `holeDropped` matching.
- [ ] **Step 2: Run** `npx vitest run test/livingHinge.test.ts -t "catch shapes"`. Expected: FAIL (`catchOutline` not defined).
- [ ] **Step 3: Implement** `LivingHingeCatch`, the new `livingHingeCatch`, and `catchOutline` per the geometry above. Build Circle and Keyhole from one helper (`neckLen` of 0 is Circle) using `arc` like `catchTongueEdge`'s.
- [ ] **Step 4: Run** the same command and `npx vitest run test/livingHinge.test.ts`. Expected: PASS, including every existing tongue test.
- [ ] **Step 5: Commit** `git add src test && git commit -m "Catch shape profiles: dovetail, keyhole, circle"`.

### Task 3: Cut sheet (2D)

**Files:**
- Modify: `src/engine/fingerJointEngine.ts` (`generateLivingHingeBox`: the notch at ~2160-2183, the finger hole at ~2411-2419, `topCatchHeaderPts` at ~2422-2436)
- Test: `test/livingHinge.test.ts` (extend `describe('catch shapes')`)

**Interfaces:**
- Consumes: `livingHingeCatch` and `catchOutline` from Task 2.
- Produces: no new exports. The front wall's notch and the wrap's outline come from `catchOutline`, and the wrap's finger-hole path is at `c.hole.centerY`.

- [ ] **Step 1: Write the failing tests**
  - `the notch is the tongue reversed, one kerf narrower` for each shape at kerf 0, 0.2 and 0.5: at several depths `d` below the root, `widthAt(tongueOutline, ...) - widthAt(notch, ...)` equals `kerf` within 1e-3. Tapered at kerf 0 still passes its existing wear-travel test.
  - `locking shapes use no wear travel`: at kerf 0, the notch and tongue widths are equal at every depth.
  - `the finger hole sits in the middle of the head`: for each shape with the hole on, the `lh-catch-finger-hole` path's center is at the head's center and inside the tongue outline with at least 3 mm of wood.
  - `the wrap's flat length is unchanged by shape except for the tongue's depth`: `wrap.heightMm` equals `c.height + lip + 2*shoulder + deck + straightH + T`, as the existing test checks for Tapered.
- [ ] **Step 2: Run** `npx vitest run test/livingHinge.test.ts -t "catch shapes"`. Expected: FAIL (2D still draws the taper).
- [ ] **Step 3: In `generateLivingHingeBox`**, replace `catchTongueEdge(...)` calls with `catchOutline(c, -kerf / 2, shape === 'tapered' ? 2 * CATCH_WEAR_TRAVEL_MM * catchTaper : 0)` for the notch and `catchOutline(c, kerf / 2)` for the tongue. Use `c.height` where the code uses `tongue.height`. Keep the existing notch-above-edge construction and the front-wall name.
- [ ] **Step 4: Run** `npx vitest run test/livingHinge.test.ts` and `npm test`. Expected: PASS. Read any snapshot diffs: only locking shapes may change.
- [ ] **Step 5: Commit** `git add src test && git commit -m "Cut the locking catch and its reverse notch"`.

### Task 4: 3D preview and fold animation

**Files:**
- Modify: `src/engine/scene3d.ts` (lines ~288-314 and the import at line 9)
- Test: `test/livingHinge.test.ts` or the file that already builds the living-hinge scene (search for `buildLivingHinge`/`scene3d` in `test/`)

**Interfaces:**
- Consumes: `livingHingeCatch`, `catchOutline` from Task 2.

- [ ] **Step 1: Write the failing test** `the 3D catch tab matches the 2D tongue for each shape`: build the scene parts for each shape; the catch tab geometry's bounding box width equals `c.width` within 0.01 and its depth equals `c.height`; the hole, when present, is centered at `c.hole.centerY`.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Draw the tab from `catchOutline(c, 0)`** and place its hole at `c.hole.centerY`; remove the `CATCH_TAPER_DEG` import if unused.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src test && git commit -m "3D preview draws the chosen catch shape"`.

### Task 5: Inspector and a check in the running app

**Files:**
- Modify: `src/ui/sections/LivingHingeSection.tsx` (the finger-hole block and the taper note at ~212-262)

**Interfaces:**
- Consumes: `livingHingeCatch` (with `fellBack`, `holeDropped`, `shrunk`), and the two settings.

- [ ] **Step 1: Add the controls.** A **Catch shape** select (`Tapered`, `Dovetail`, `Keyhole`, `Circle`) above the finger-hole switch, and a **Lock** `NumberField` (`minMm` 0.1, `maxMm` 0.8, `step` 0.05, `ariaLabel` "Catch lock") shown for the three locking shapes. Both call `updateParam`.
- [ ] **Step 2: Make the notes match the result.** Tapered keeps today's 2 degree wedge note. Locking shapes say the tongue presses in and locks, and that a firm pull on the lid's front edge frees it. When `fellBack`, show a `hinge-web-warning` note that the front wall is too small for the chosen shape so the tapered catch is used. When `holeDropped`, say there's no room for a finger hole. When the shape is `circle` or `keyhole`, label the hole size field **Hole diameter** and hide the height field.
- [ ] **Step 3: Run** `npx tsc && npm test`. Expected: no type errors, all tests PASS.
- [ ] **Step 4: Check it in the app.** Start the dev server with `npm run dev`, open a living-hinge box, and for each of the four shapes confirm the cut sheet and the 3D view show the shape, the notch is its reverse, the fold animation closes without the tongue colliding with the front wall, and the exploded view looks right. Shrink the box until a locking shape falls back and confirm the warning appears. Switch to inches and confirm **Lock** and **Hole diameter** show sensible values.
- [ ] **Step 5: Commit** `git add src && git commit -m "Inspector: catch shape and lock controls"`.
