# Boxer (`labs.aaronjellis.com/boxer`)

Browser-based parametric laser-cutting, cardboard packaging, and 3D-printed enclosure studio.

## Features

- **Wood & MDF Finger-Joint Boxes**:
  - 6-Panel Finger-Joint Box (Open tray, 6-sided closed, flat lift-off lid, inset retainer rim lid)
  - Treasure Chest / Clamshell Box (integrated rear knuckle fingers, side-wall pivot pins, butt-hinge screw holes, or a printed hinge (STL) that fits the same holes)
  - Living-Hinge Curved Lid Box (parametric kerf-cut lattice)
  - Slotted Organizer Grid Box (interlocking $X \times Y$ compartment dividers)
- **Score-and-Fold Cardboard Packaging**:
  - Roll-End Tuck Top Mailer (`RETT`) with rollover side walls, a tuck top or front-lock closure, lid side flaps, and inner-wall tabs into floor slots; spans come from a written ply model
  - Standard Folding Carton (`RTE` / `STE`) with tapered glue tab and dust flaps
  - Two-Piece Telescoping Tray & Slip Lid Box
  - Supports both **Continuous Vector Score** and **Dashed Perforation (`Cut / Bridge`)** for thick corrugated flutes
- **3D-Printed Parametric Enclosure Utility**:
  - Customizable wall/floor thickness, inner fillets, outer fillets, and 45° print-bed chamfers; registration lip, filament-pin knuckle hinge, cantilever snap clasp; STL as one file or two
- **Face Artwork & 1:1 Print-Then-Cut Export**:
  - Place and scale SVG/PNG graphics on any box face, preview in 3D and 2D, and export 1:1 millimeter **Layered SVG**, **Layered PDF (`pdf-lib`)**, **DXF**, or **STL** with presets for **xTool Studio (xTool M2 Print + Cut)**, **LightBurn**, **Adobe Illustrator**, and **Glowforge**.

## Exports

- **SVG** is the known-good path for any laser. It uses three colors (cut, score, guide) and, for the xTool Studio profile, groups each piece in its own `<g>`. Perforation lines export as cuts.
- **xTool project (`.xcs`)** opens in xTool Studio with cut and score settings already assigned. It is hidden by default: set `VITE_XCS_EXPORT=1` (see `.env.example`) to show it.
- The `.xcs` format is reverse-engineered, so an xTool Studio update can break it and may need a fix.

## Development

```bash
npm install
npm run dev      # Start Vite dev server
npm test         # Run Vitest unit tests
npm run build    # Typecheck & build to dist/boxer
```
