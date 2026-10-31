# Wine carrier: design

A new wood box type: a tall laser-cut carrier for one bottle of wine, with a handle on top that
locks shut. It joins the box types in Kerfuffle and, through the shared engine, in the Atomm
generator (Finger Joint Box Maker).

## Why

Wine carriers are one of the most popular laser-cut gift items, and every one is a fixed file
for one bottle size. A parametric one, sized from the bottle, with Kerfuffle's patterns, text and
artwork, is something people can't get from a downloaded template. It also shows off what the
engine already does well: living hinges, see-through patterns and engraving.

Reference photos (from the conversation): commercial tab-and-slot wooden wine carriers with
living-hinge shoulders, a doubled handle with a hole, see-through patterns on the walls, and a
slotted ear on each side piece that holds the handle together.

## What it is

A tall rectangular box around one bottle. Six kinds of piece:

- **Front and back** (the same shape, mirrored): each rises straight up the body, bends inward
  over a living hinge into a short sloped shoulder, then bends back to vertical over a second
  living hinge and stands up as one half of the handle. Each handle half has a rounded handle
  hole; the two halves meet face to face at the top.
- **Two side pieces**: straight sides up the body, a gentle slope in at the shoulders matching
  the front and back's taper, then an **ear** rising between the handle halves.
- **Bottom.**

### Opening and closing

The front and back are flaps. Unlock the ears and each flap's shoulder hinges straighten as it
bends outward, opening the top so the bottle slides in or out from above; close them and they
bend back in until the handle halves meet. So the shoulder hinges flex on every opening, not just
once at assembly (user).

### The lock

Each handle half has a tab on each of its two side edges. The handle halves meet face to face, so
on each side their two tabs stack and go into **one slot** in that side's ear, together. The two
ears hold the handle halves together and the box shut. *(My call, from the photos: one slot per
ear for both tabs.)*

Each ear flexes like a latch: an **oval patch of living-hinge slits** across the ear's base lets
it bend outward, away from the box. Pull the ear out and the handle tabs slip free; let go and it springs back and
holds them. The oval keeps the flex to the ear, not the whole side wall.

### Joinery

**Tab-and-slot, not corner finger joints.** The side pieces' tabs pass through slots in the front
and back, which lie over the sides, along the **straight body only**; the bottom tabs into the
walls the same way. **No tabs or slots on the taper** (user): the side pieces' sloped edges are
guides the closed flaps rest against, not joints, so the flaps can swing open. The user chose
this because it holds better without glue than finger joints, which can break. Tabs friction-fit
using the kerf offset, so the box goes together dry.

This is new joinery for the engine (today every wood box uses corner finger joints). It needs:
tabs along a piece's edge, and matching slots through a face. Write it so other box types could
use it later, but only the wine carrier uses it now.

### The taper

The top narrows toward the handle without following a bottle's shape: the body is a plain tall
box with room around the bottle, and the shoulders only suggest a bottle's (user: "a light
taper").

*(My calls, matching all three reference photos:)* The box keeps its **full width** to the top;
only the **depth** closes, the front and back sloping in until the handle halves meet face to
face. So the front and back stay rectangles and the side pieces carry the slope. The one control
(working name **Shoulder taper**) sets how tall the shoulders are, which sets how steep they look;
its default puts the bottle's whole neck inside the tapered part, with the slope clear of it, and
the shoulders start above the bottle's own shoulders so the taper never pinches it.

### Size

Sized from the bottle: pick a **standard bottle** (for example a 750 ml Bordeaux, a Burgundy, a
champagne, a magnum) and adjust, or enter a **custom** diameter and height. The box adds
clearance around and above it. The user asked for both: presets to start from, and custom
always available.

### Decoration

- See-through **patterns** on the side pieces and on the front and back's body, using the
  existing face patterns, including the new **crop shapes** (oval, pill, scallop and the rest).
- **Text and artwork** on the front, engraved or cut out (Kerfuffle's artwork and text tools;
  the generator's Text and Artwork cards).
- The **living-hinge pattern** choice and the bend checks apply to all four shoulder bends and to
  the ears' oval patches.

## Goals

- A wine carrier box type in both apps, with the 2D sheet, 3D preview (bent shoulders, the
  handle closed, ears holding it) and every export, like the other box types.
- The lock works and keeps working: handle tabs in ear slots, ears that flex and spring back.
- Sized from a standard or custom bottle, with clearance.
- Patterns (with crop), text and artwork on its faces.
- The bend checks warn when a shoulder or an ear won't bend without cracking, as the
  living-hinge box does. Both flex on every opening, so their defaults should leave margin for
  repeated bending, not just one bend at assembly.

## Non-goals

- A bottle-shaped profile. The body is a plain tall box; the taper is light.
- More than one bottle, or dividers.
- A cardboard or 3D-printed version.
- Corner finger joints for this type.
- Moving the other box types to tab-and-slot.

## Anti-goals (would make it a failure even if it technically works)

- A lock that wears loose after a few openings, or an ear that snaps when flexed.
- Shoulder hinges that crack at the default settings in 3 mm basswood or MDF.
- Tabs that need glue to hold, or fall out when the box is carried.
- A box that pinches the bottle or that the bottle can't be lifted out of.

## Constraints

- One engine: the box type lives in Kerfuffle's engine (`src/engine`), so the generator gets it
  through the submodule. The generator needs a card for its own settings (bottle, taper), as it
  has for the living-hinge box.
- 3D uses the existing living-hinge bend model (`scene3d`'s bent-wrap geometry), extended from
  the living-hinge box's two bends to the carrier's four.
- Every piece must work with material sheets (smaller than the bed), the kerf offset, and the
  Atomm export spec (cut red, score and engrave blue).
- Patterns must stay out of the hinge zones, the ear patch, the tab slots and the handle hole.

## Decided

- Front and back both bend on living hinges and become the handle halves (user).
- The front and back open as flaps, bending outward at the shoulders, and the bottle goes in and
  out from the top (user).
- No tabs or slots on the taper; tab-and-slot along the straight body only (user).
- Handle tabs lock into slots in the side pieces' ears (user).
- The ears flex on an oval living-hinge patch, like a latch (user, sketch A).
- Tab-and-slot joinery (user).
- A light taper, not a bottle shape (user).
- Standard bottle presets plus custom size (user).
- Patterns can be cropped to a shape; the oval-window look is the motivating case (user; built).

## Left to the builder

- The bottle presets and their dimensions, and the default clearance.
- The taper's control and default, and where exactly the shoulders start.
- Tab count, length and spacing along each edge; slot sizes with the kerf offset.
- The handle hole's shape and size, and how far the handle stands above the shoulders.
- The ear's height, its slot, and the oval patch's size and slit pattern, checked so the ear
  bends without cracking.
- The bottom's fit (tabbed into all four walls, or resting on tabs).
- Whether to offer arched feet cut into the bottom of the front and back, as in all three
  reference photos (builder's call: an option, on by default).
- How the 2D sheet labels and orders the pieces.
