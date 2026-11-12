# Book box

Date: 2026-11-11. Status: draft for approval.

## Intent

A laser-cut wood box that looks like a hardcover book lying on a table. One piece of wood wraps
around it as the back cover, the spine, and the front cover; living-hinge cuts in the spine strip let
it curve like a book's rounded spine and let the front cover swing open. The other three sides look
like the edges of the page block. The owner wants to put text and artwork on the front cover and
patterns on the page edges.

## Goals

- A new wood box type, **Book box**, next to the living-hinge box in the box type picker.
- Closed, it reads as a book: spine on the left, a flat front cover on top, covers that overhang the
  page block a little, page edges on the other three sides.
- The front cover opens on the spine's living hinge and lies flat on the page block when closed.
- Guide pins keep the closed cover flat and in place.
- The front cover and the back cover take artwork and text. The three page-edge walls
  take the existing see-through patterns, and can carry engraved page lines.
- It works everywhere the other wood boxes do: the cut sheet, the 3D preview and fold slider, the
  inspector, nesting and material sheets, project files, and every export.

## Non-goals

- A lock, magnets, or a clasp.
- Raised bands, headbands, or any other decoration built into the spine. Artwork covers those.
- A removable tray or dividers inside.
- Changing the living-hinge box, the wine carrier, or the hinge test cards.

## Anti-goals

- A cover that springs open or sits proud of the page block. A living hinge wants to lie flat again,
  so something has to hold the cover down.
- A spine bent tighter than the hinge pattern can take, with no warning.
- Hinge cuts running through the flat covers, or through the area where cover artwork goes.
- A look-alike of another tool's book box. Names, controls, and defaults are Kerfuffle's own.

## What the owner decided

- **It looks like a book.** Hinge (spine) on the left, a flat cover with artwork on it.
- **Page sides.** Seen from the edges, the sides of the box mimic the pages of the book.
- **Guide pins.** A couple of guide pins at the cover, so it stays flat.
- **Decoration.** Patterns go on the edges; text and artwork go on the front.
- **Construction.** The owner read and approved this description:
  - One wrap piece is the front cover, the spine, and the back cover. The hinge cuts are only in the
    spine strip, so the spine curves and both covers stay flat.
  - The back cover is the box's bottom. The page walls are joined to it. The front cover swings on
    the spine.
  - The three page walls sit a few millimeters inside the cover edges, so the covers overhang like a
    hardcover's.
  - A fourth wall stands inside, behind the curved spine, so contents can't fall into the hinge.
  - The page walls get engraved fine lines by default, and can take any existing pattern.
  - Two pegs stand up from the top of a page wall and drop into holes in the front cover.
  - The spine takes text too, between the hinge cuts or on a solid band.

## Calls made by the designer

The owner has not seen these. Treat them as defaults.

### Naming and orientation

- **Template.** A new `BoxTemplateId`, `'finger-book'`, category `'wood-finger'`, with its own
  generator in a new `src/engine/bookBox.ts`, called from `generateWoodFingerBox` the way the wine
  carrier's is. Box type: id `finger-book`, name **Book box**, blurb "A cover that opens on a
  curved spine".
- **Axes.** The book lies flat. Width runs from the spine to the fore edge (x), depth from tail to
  head (z, the tail faces the viewer), height is the book's thickness (y).
- **Faces.** `top` is the front cover, `bottom` the back cover, `left` the spine, `right` the fore
  edge, `front` the tail, `back` the head. Their default names are **Front cover**, **Back cover**,
  **Spine**, **Fore edge**, **Tail**, **Head**. The inner wall is `spine-wall`, **Spine wall**; it
  takes no artwork or pattern.
- **Thumbnail size.** The picker thumbnail is posed at 120 × 170 × 35 mm inside (width × depth ×
  height). Picking the box type keeps the size already typed, as picking any other type does.

### Size

With `T` the material thickness, `ov` the cover overhang, `band` a solid strip of max(5 mm, 1.5T),
and `r` the spine's bend radius measured at the middle of the wood:

- Inner width is spine wall to fore-edge wall, inner depth is tail wall to head wall, inner height is
  back cover to front cover.
- Outer height = inner height + 2T.
- Outer depth = inner depth + 2T + 2·ov.
- Outer width = inner width + 2T + ov + band + r + T/2. The spine bulges out past the line where
  the covers stop and the bend starts.
- **Solid band.** The spine wall's outer face sits `band` inside the bend line, on both covers, so
  the spine wall's slots in the back cover don't run into the first row of hinge slits. The
  living-hinge box keeps the same band for the same reason.
- Inside/outside sizing works as for the other templates: the generator reports its outer size.

### The wrap

- **One panel**, `wrap`, on the sheet with the bend running along its length: back cover, spine
  strip, front cover. Its width is the outer depth. Each cover's length is inner width + 2T + ov + band.
- **Spine profile.** Cover, a quarter-turn arc of radius `r`, a flat band, a second quarter-turn arc,
  cover. The band's length is (inner height + T) − 2r. When `r` is half of (inner height + T) the
  band is gone and the spine is one half-round: the default.
- **Spine radius setting.** `bookSpineRadiusMm`, default 0, meaning full round. A smaller value
  gives tighter shoulders and a flat band between them. It's clamped to full round at the top. The
  inspector shows the hinge pattern's estimated tightest bend (`hingeBendRadiusMm`) and warns, the
  way the living-hinge section does today, when the spine is tighter than that. With the default
  full round this is a warning that the book is too thin for the pattern.
- **Hinge cuts** use the existing living-hinge pattern settings (`livingHingePattern`, pitch, cut,
  bridge) and `livingHingeZoneCuts`. They cover the two arcs only. A flat band, when there is one,
  stays solid.
- **No spine artwork.** The owner dropped it after seeing the build: the spine is the hinge and takes
  no artwork, text, or pattern.
- **Corners.** The covers' four free corners are rounded, radius 2 mm, like a hardcover's.

### The page block

- **Four walls**: `front` (tail), `back` (head), `right` (fore edge), and `spine-wall`. All are the
  inner height tall. They meet each other in finger joints at the four corners, using the existing
  finger-joint settings.
- **Joined to the back cover** by tabs through slots (`tabSlot.ts`), since the walls sit inside the
  cover's edge. The tabs come through flush with the back cover's outer face.
- **Top edges** are plain, apart from the guide pins. The front cover rests on them.
- **Cover overhang.** `bookCoverOverhangMm`, default 4, range max(3 mm, T) to 10 mm; a stored value
  below the minimum is raised to it. It applies to the tail, head, and fore edge. The minimum keeps
  sound wood outside the wall slots and the pin slots, so the walls are never flush with the cover
  edges.

### Guide pins

- **Where.** Two pins on the top edge of the fore-edge wall, the wall farthest from the spine, a
  quarter of the way in from each end. Matching slots go through the front cover.
- **Size.** Each pin is max(6 mm, 2T) long along the wall, T thick, and stands T tall, so it finishes
  flush with the cover's outer face. Its top corners are eased so it finds the slot.
- **Fit.** The pins are a light press fit, the same kerf rule as the tab-and-slot joints, because
  they are what holds the cover down against the hinge's spring. The overhanging fore edge of the
  cover is the grip for pulling it free.
- **Setting.** `bookGuidePins`, default on. With it off, the fore-edge wall's top is plain and the
  cover has no slots.
- The slots show on the front cover. They are outside the cover's safe area for artwork.

### Page lines

- **What.** Engraved lines, optional: score-layer lines along the outer faces of the tail, head, and fore-edge walls, parallel to the
  covers, evenly spaced from top to bottom, standing in for page edges. They are on the score layer
  on the sheet and drawn on the walls in 3D (`surfaceLines`).
- **Settings.** `bookPageLines`, default off (the owner's call after seeing the build); `bookPageLineSpacingMm`, default 1.5, range 0.8 to 5.
- **With a see-through pattern.** A wall that has a pattern from the Pattern section gets the
  pattern and no page lines.

### Patterns and artwork

- The tail, head, and fore-edge walls are pattern faces. The front and back covers are too; a
  pattern on the front cover keeps clear of the pin slots. The spine is not.
- Artwork can go on the front cover, the back cover, and the three page walls. It lands in
  the right place on the wrap piece on the sheet and in every export, and shows on the right face in
  3D.

### Inspector

- Sections, in order: Size, Material, **Book**, Living hinge, Joints, Pattern, Labels, Artwork,
  Sheet.
- **Book** holds: cover overhang, spine radius (with a **Full round** state), guide pins, page
  lines, and page line spacing.
- **Living hinge** shows the pattern controls only. The catch, peg, thumb-hole, attach-mode, and
  top-guide controls belong to the living-hinge box and don't appear.

### 3D preview

- Closed, the wrap is drawn bent around the page block along its real profile, with the hinge slits
  drawn on the arcs.
- The fold slider opens the book: the front cover swings open as both spine bends straighten, until
  the wrap lies flat beside the back cover, while the walls move apart.
- **Reading direction.** The bend has to run along the wrap's length, so the covers sit a quarter
  turn from reading-upright on the sheet. New artwork on a cover starts turned to read upright with
  the spine on the left; the owner can still rotate it.

## Left to the builder

- Whether the wrap is one bent 3D panel or separate cover and spine panels, and how artwork and
  patterns are mapped onto its faces. The existing wine carrier's bent panels and the cardboard
  boxes' sub-faces are the two precedents.
- The finger counts and tab counts, following the existing rules.
- The exact page-line margins at the top and bottom of a wall.
- How the size clamps and warnings are worded, following `paramRules.ts` and the existing sections.
- Tests, following the existing engine tests: the generator's panels and sizes, the spine profile for
  full round and for a flat band, pins on and off, page lines on and off, and a project file from
  before this change still loading.
