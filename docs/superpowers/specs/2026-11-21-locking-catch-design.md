# Locking catch for the living-hinge box

Date: 2026-11-21. Status: draft for approval.

## Intent

The living-hinge box (`finger-living-hinge`) closes with a catch tongue on the lid's front lip that
presses into a notch in the top of the front wall. Today the tongue and notch taper 2 degrees a side
(a "V"), so the fit wedges tight but only by friction. The owner wants a choice of catch shapes that
lock: the tongue is wider at its tip than at its root, the notch is the exact reverse shape, and you
press the tongue straight in. It stays in until you pull the lid's front edge free.

## Goals

- A **Catch shape** setting in the living-hinge section: **Tapered** (today's V, the default for
  existing projects), **Dovetail** (an "A"), **Keyhole** (a neck and a round head) and **Circle**
  (a round head with no neck).
- A **Lock** setting that sets how much wider the head is than the root, within what the wood can flex.
- Rounded corners on every shape, as the tongue has today.
- The finger hole works with the locking shapes where there is room.
- The shapes show in the cut sheet, the 3D preview and fold animation, the inspector and the exports.

## Non-goals

- A lid that shifts sideways or slides to lock. The only motion is pressing the tongue in.
- Separate pegs, glued parts, or any moving latch part.
- Changing the wine carrier, the printed box, or the lid's rear attachment modes.
- The peg latch in `2026-11-10-living-hinge-peg-latch-design.md`. It stays a draft.

## Anti-goals

- A head so wide the notch's ears snap when the tongue goes in.
- A "locking" shape with no undercut, which would behave like the tapered catch.
- A tongue too tall for the front wall.

## Approaches

- **Shape setting with one profile (chosen):** the tongue and notch edges come from one shape
  profile, and the notch is the same profile reversed with the kerf allowance. Adds shapes cleanly.
- **Dovetail only, flip the taper sign:** the smallest change, but gives no choice of shapes.
- **Separate glued-in catch pieces:** more parts and steps, and not a flat laser cut.

## What the owner decided

- The lock is a press-in fit into the reverse of the tongue's shape. No other movement.
- Dovetail corners stay rounded.
- Shapes offered: Tapered, Dovetail, Keyhole, and Circle.
- **Circle:** a circle with no neck. Its top overlaps the lid's front lip, so the lip edge crosses
  the circle above its equator and the chord there is the neck. The lip edge must stay above the
  equator. At or below it, the sides lean in toward the tip and the shape behaves like the tapered
  catch, which may not grip.
- **Keyhole** can be too tall for many boxes, which is why Circle exists.
- The finger cutout must work with Circle.

## Calls made by the designer

The owner has not seen these. Treat them as defaults.

- **Undercut size.** Wood flexes a fraction of a millimetre, so the default undercut is about 0.4 mm
  a side at the root. **Lock** scales it. Dovetail leans out about 6 degrees a side at the default.
  Circle sets it by how far the circle's center sits below the lip edge, as a share of its radius
  (about 0.4 by default, never below 0.2).
- **Depth.** Locking shapes are at least `2T` deep, more for Keyhole and Circle. On a front wall too
  short for the chosen shape, the catch falls back to Tapered, and the inspector says so, as it does
  for other features that don't fit.
- **No wear travel.** The locking shapes seat flush, so `CATCH_WEAR_TRAVEL_MM` applies to Tapered only.
- **Finger hole.** Circle: a round hole centered in the head, sized by the existing width field, with
  the head growing to hold it and both shrinking to fit the box. Dovetail and Keyhole: the same, only
  where their head has room; otherwise the hole is left off with a note.
- **Defaults.** Existing projects and presets keep Tapered, so nothing changes until you pick a shape.
- **Notes.** The section's note about the 2 degree taper shows only for Tapered. The other shapes
  explain the press-in lock and that a firm pull on the lip's front edge frees it.

## How it fits together

Looking at the front wall from the front, the lid's lip above it, tip down:

```
 Tapered           Dovetail          Keyhole           Circle
 ┌───────┐         ┌─────┐           ┌───┐             ───────
  ╲     ╱         ╱       ╲          │   │            ╱       ╲
   ╰───╯         ╰─────────╯        ╭┘   └╮           │   ○   │
                                    ╰─────╯            ╰─────╯
```

`catchTongueEdge` and `catchTongueRadii` in `src/engine/fingerJointEngine.ts` become shape-aware.
`livingHingeCatch` returns the shape's size. The notch in `generateLivingHingeBox` and the lid's
outline use the same profile, the notch drawn a kerf narrower and the tongue a kerf wider, as today.
The inspector controls are in `src/ui/sections/LivingHingeSection.tsx`, defaults in
`src/engine/presets.ts`, and the new settings go in `BoxParameters` (`src/engine/types.ts`).
`parseProject` already drops settings it doesn't know, so old `.kerf` files open as Tapered.

## Testing

- Each shape's tongue is wider at its widest point than at its root, except Tapered. Circle's lip
  edge crosses above its equator at every Lock value.
- The notch is the tongue's shape reversed, narrower by the kerf allowance, and the two meet when
  the beam has burned both.
- Corners stay rounded, and the radii shrink to what fits on small tongues.
- A short front wall falls back to Tapered, and the inspector's note matches.
- The finger hole fits inside each head, shrinks to fit, or is left off with a note.
- An old `.kerf` file opens as Tapered with no change to its cut sheet.
- The existing living-hinge tests that don't concern the tongue pass; snapshot diffs are read.
- The 3D preview and fold animation are checked in the running app.

## Left to the builder

- The exact profile code and how Lock maps to each shape's undercut.
- Minimum depths and the order shapes fall back on small boxes.
- Labels for the inspector and the shape picker.
