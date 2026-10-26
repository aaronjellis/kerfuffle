# Boxer (`labs.aaronjellis.com/boxer`)

Browser-based parametric laser-cutting, cardboard packaging, and 3D-printed enclosure studio.

## Features

- **Wood & MDF Finger-Joint Boxes**:
  - 6-Panel Finger-Joint Box (Open tray, 6-sided closed, flat lift-off lid, inset retainer rim lid)
  - Treasure Chest / Clamshell Box (integrated rear knuckle fingers or side-wall pivot pins)
  - Living-Hinge Curved Lid Box (parametric kerf-cut lattice)
  - Slotted Organizer Grid Box (interlocking $X \times Y$ compartment dividers)
- **Score-and-Fold Cardboard Packaging**:
  - Roll-End Tuck Top Mailer (`RETT`) with rollover side walls, dust flaps, and cherry-lock tuck flap
  - Standard Folding Carton (`RTE` / `STE`) with tapered glue tab and dust flaps
  - Two-Piece Telescoping Tray & Slip Lid Box
  - Supports both **Continuous Vector Score** and **Dashed Perforation (`Cut / Bridge`)** for thick corrugated flutes
- **3D-Printed Parametric Enclosure Utility**:
  - Customizable wall/floor thickness, inner fillets, outer fillets, 45° print-bed chamfers, snap-fit front clasp, and rear hinge lugs with direct `.STL` export
- **Face Artwork & 1:1 Print-Then-Cut Export**:
  - Place and scale SVG/PNG graphics on any box face, preview in 3D and 2D, and export 1:1 millimeter **Layered SVG**, **Layered PDF (`pdf-lib`)**, **DXF**, or **STL** with presets for **xTool Studio (xTool M2 Print + Cut)**, **LightBurn**, **Adobe Illustrator**, and **Glowforge**.

## Development

```bash
npm install
npm run dev      # Start Vite dev server
npm test         # Run Vitest unit tests
npm run build    # Typecheck & build to dist/boxer
```
