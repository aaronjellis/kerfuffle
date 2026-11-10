# Freeform dividers for the 3D-printed box

Date: 2026-11-09. Status: draft for approval.

## Intent

When you design a 3D-printed box in Kerfuffle, you can't split its interior into compartments. The
laser-cut organizer has dividers, but only as an even grid set by two numbers. The owner wants to
lay out compartments by hand: pick a divider tool, click where a divider goes, and drag dividers
around until the sections match what goes in the box.

This also has to be Kerfuffle's own design. It was prompted by looking at another product's
organizer generators, and the owner wants nothing that could be called a copy. The direct-
manipulation divider tool inside the existing box editor is the original part; don't borrow names,
presets, or layouts from other tools.

## Goals

- Place a divider in the printed box with one click, with a live preview of where it lands.
- A divider runs in one of two directions and extends until it meets a wall or another divider.
- Drag a divider to slide it; dividers that end on it stretch to follow.
- Click a divider and press `Delete` to remove it; dividers that ended on it grow to the next wall
  or divider.
- The dividers print as part of the base and appear in the 3D preview and the base STL.
- The tool works in the 2D plan (step 1) and in the 3D view (step 2).

## Non-goals

- The laser-cut organizer (`finger-organizer`) keeps its even `dividerCols` × `dividerRows` grid.
- Per-divider thickness or height.
- Angled or curved dividers.
- A removable insert tray printed as a separate part.
- Dividers in the lid.

## Anti-goals

- A catalog of preset layouts or a separate single-purpose "organizer maker" page. The feature is a
  tool inside the existing printed-box editor.
- Any divider that prints detached from the floor or walls, or that collides with the lid's
  registration lip, hinge, or clasp.

## What the owner decided

These came from the owner, in conversation and by trying a clickable sketch
(`.superpowers/brainstorm/84311-1794287434/content/divider-tool.html`, throwaway, git-ignored). The
sketch "works exactly as expected", so its behavior is the reference for the interaction.

- The feature is for the 3D-printed box (`3d-snap-box`), in the design tool. It is about dragging
  sections around on screen, not about physically movable dividers.
- Layout is freeform, not a grid. A divider stops at the first wall or divider it meets on each
  side.
- You open a divider tool, hover to see where the divider will go, and click to place it.
- A button and a hotkey flip the divider's direction.
- A move interaction slides a placed divider; attached dividers stretch.
- To delete, click the divider and press `Delete`. Dependent dividers grow.
- The tool is also available in the 3D view. A divider shows a hover state before you can drag it.
  If no divider is hovered, a drag orbits the camera as it does today.
- Divider thickness starts equal to the box wall thickness and is then adjustable on its own. One
  thickness is shared by all dividers for now.

## Calls made by the designer

The owner saw the first group in a summary and raised no objection. Treat them as defaults that
can change in review, not as owner requirements.

- **Where the tool lives.** On the base's top-down plan in the 2D view (panel `base-3d-plan` from
  `generate3DPrintBox`), with **Divider** and **Move** tool buttons shown only for the printed box.
- **Hotkeys.** `R` flips direction, `Delete` or `Backspace` removes the selected divider, `Escape`
  leaves the tool. Hotkeys are ignored while a text or number field has focus.
- **Preview.** The hover preview shows the size of the section on each side of the divider, as the
  sketch does, in the current display unit.
- **Snapping.** Dividers have real thickness, so what snaps is a clear section size, not the
  centerline: the gap from the divider's face to its neighbor on the left (for a front-to-back
  divider) or front (for a side-to-side one) snaps to 1 mm. The layout stores centerlines; changing
  the thickness keeps centerlines and does not re-snap.
- **Exact sizes.** A selected divider shows two number fields, the clear size of the section on
  each side. Editing either moves the divider, within its limits.
- **Minimum section.** No clear gap between a divider and its neighbor (wall or parallel divider)
  may be under 5 mm. Placement that would break this shows no preview and does nothing; a drag
  clamps at the limit. A drag also can't shorten an attached divider below 5 mm.
- **Height.** One height shared by all dividers, measured from the floor. The maximum and the
  default are the base's rim (`baseH - floor`): dividers never rise above the rim into the lid. The
  registration lip is part of the base, so dividers merge with it where they meet. The user can
  lower the height. Consequence, accepted for this version: the lid's cavity stays open above the
  dividers, so small contents can cross sections in a closed box unless the lid is made shallow.
  Dividers that follow the lid's swing above the rim are out of scope.
- **Thickness.** A `dividerThickness3dMm` setting. It follows `wallThickness3dMm` until the user
  edits it, then stays independent. The builder picks how to store "still following".
- **Resizing the box.** Divider positions scale in proportion to the interior. Scaled positions are
  not re-snapped; snapping applies again on the next drag. The saved layout records the interior
  size it was drawn for and is scaled on use, so nothing is lost. A divider that no longer fits
  (a section under the minimum, or an end inside a corner fillet) is hidden, not deleted: the
  inspector says how many are hidden, and they return if the box grows back. The same applies when
  a thicker divider setting squeezes a section. Limit: an edit saves the layout that is on screen,
  so editing while dividers are hidden removes them for good; the inspector says so beside the
  hidden count.
- **Rounded corners.** A divider end meets the straight part of a wall. A divider can't be placed
  where it would end inside an inner corner fillet.
- **Saving.** The layout is part of `BoxParameters` and saves in the `.kerf` project file. Old
  files load with no dividers.
- **Undo.** The app has no undo today. This feature adds undo and redo for divider edits only
  (place, move, delete), with `Cmd/Ctrl+Z` and `Shift+Cmd/Ctrl+Z` while a divider tool is active. A
  general app-wide undo is out of scope.
- **Touch in 2D.** With no hover, press and slide shows the preview and release places the divider.
- **Touch in 3D.** A one-finger drag still orbits. A tap on the floor places a divider at that
  point with no preview (undo covers a miss). A drag that starts on a divider moves it. A tap on a
  divider selects it, and the selection shows a **Delete** button, since a phone has no `Delete`
  key; the same button appears in 2D on touch.
- **Phones.** A phone shows 3D instead of the split view. The tool buttons appear in whichever view
  is showing, so after step 1 a phone user who picks a divider tool is switched to the 2D view.
- **Inspector.** A **Dividers** section for the printed box holds thickness, height, the divider
  count, and a **Remove all** button.

## How it works

### Model

Store the layout as data, not as a grid. A suggested shape, in the interior's own millimetre frame
(origin at one inner corner, x across the width, y across the depth):

```ts
interface PrintDivider {
  id: string;
  axis: 'x' | 'y';   // the axis the divider runs along
  pos: number;       // its fixed coordinate on the other axis (centerline)
  from: number;      // start along its axis
  to: number;        // end along its axis
}
```

Whether to store `from`/`to` or re-derive them from the neighbors each time is the builder's
choice. What must hold after every edit:

- Each end of every divider lies on an inner wall or on a perpendicular divider that spans that
  point.
- No two dividers overlap or cross. A divider placed in a section stops at that section's edges, so
  crossings never form; two dividers can meet the same divider from opposite sides at the same
  point.
- The minimum-section rule holds.

### Layout rules: one pure module

Put the rules in a new engine module with no React or three.js in it, so the 2D tool, the 3D tool,
and the tests all use the same code. It needs, at least:

- **Preview for a point.** Given the layout, a direction, and a point in the interior frame, return
  the divider that would be placed (snapped, with its ends found by walking out to the nearest wall
  or perpendicular divider) and the section sizes on each side, or nothing if it's not allowed.
- **Place.** Add that divider.
- **Move.** Slide a divider to a new position within its limits. Perpendicular dividers that end on
  it change length to stay attached. The limits are the nearest parallel neighbor on each side and
  the minimum length of anything attached.
- **Delete.** Remove a divider, then extend each divider that ended on it until it meets the next
  wall or perpendicular divider. If the extension would run into the end of a divider coming the
  other way at the same position, the builder decides whether they merge into one; either is fine
  as long as the invariants hold.
- **Rescale.** Map a layout to new interior dimensions.

### Geometry

Dividers belong to the base. Build them where the base shell pieces are built
(`buildShellPieces` in `src/engine/printParts.ts`), as boxes that overlap the floor and whatever
they touch by a small amount so the slicer sees one solid, the way the lip anchor overlaps the
wall. They then flow through `buildPrintPartWorldGeometry` to the 3D preview and through
`printStl.ts` to both STL exports with no separate export work. Whether dividers get their own
`PrintPartId` (so a click in 3D can tell a divider from the shell) is the builder's call; step 2
needs to know which divider was hit.

The base's 2D plan gains one outline per divider so the layout shows in the 2D view and in the
2D exports of the plan.

### Step 1: the 2D tool

In `Viewport2D`, on the base plan only:

- **Divider tool.** Pointer move shows the dashed preview and the two section sizes. Click places.
  **Flip direction** and `R` switch direction. The tool stays active for placing several dividers.
- **Move tool.** Hovering a divider highlights it. Drag slides it. Click selects it; the selected
  divider shows its position field and can be deleted.
- Existing 2D behavior (pan, zoom, artwork selection) is unchanged when no divider tool is active.
  How the tools coexist with artwork editing on the same panel is the builder's call; the printed
  box plan is a safe place to make the divider tools exclusive while active.

### Step 2: the 3D tool

In `Viewport3D`, sharing the same tool state and the same layout module:

- With the **Divider** tool active, raycast the pointer onto the base's floor plane, convert the
  hit to the interior frame, and show the same preview as a translucent divider. Click places it.
- A placed divider highlights on hover. A drag that starts on a highlighted divider slides it and
  suspends `OrbitControls` for that drag. Any other drag orbits, as today.
- While a divider tool is active, the lid must not block the interior. Open or hide it; the builder
  picks which, and restores the previous state when the tool closes.
- Click selects, `Delete` removes, as in 2D.

Step 2 ships after step 1 and must not require rewriting step 1.

## Testing

- Unit tests for the layout module carry most of the weight: preview ends at walls and dividers,
  the minimum-section rule, move with attached dividers, delete with growth, rescale, and the
  invariants after random sequences of edits.
- A geometry test that the base with dividers is still a closed, printable solid and that no
  divider rises above the base rim.
- A project-file test that layouts round-trip and old files load.
- The interaction itself is checked in the running app, in 2D and then 3D.

## Left to the builder

- Module and file names, the tool state's home (App, Stage, or a hook), and the visual styling of
  the tools, using the existing tokens and stage colors.
- Everything marked as the builder's choice above.
