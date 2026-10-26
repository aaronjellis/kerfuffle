import { BoxCategory, BoxParameters, BoxTemplateId, ExportProfileId, MachineBedPreset } from './types';

export const MACHINE_BED_PRESETS: MachineBedPreset[] = [
  {
    id: 'xtool-m2',
    name: 'xTool M2 / M1 (385 × 300 mm)',
    widthMm: 385,
    heightMm: 300,
    description: 'xTool M2 / M1 Laser & Print+Blade workspace',
  },
  {
    id: 'xtool-s1',
    name: 'xTool S1 (498 × 319 mm)',
    widthMm: 498,
    heightMm: 319,
    description: 'xTool S1 enclosed diode laser bed',
  },
  {
    id: 'xtool-p2',
    name: 'xTool P2 CO2 (600 × 305 mm)',
    widthMm: 600,
    heightMm: 305,
    description: 'xTool P2 55W CO2 laser bed',
  },
  {
    id: 'lightburn-400',
    name: 'Standard Diode (400 × 400 mm)',
    widthMm: 400,
    heightMm: 400,
    description: 'Common 400×400mm open-frame laser bed',
  },
  {
    id: 'glowforge',
    name: 'Glowforge (495 × 279 mm)',
    widthMm: 495,
    heightMm: 279,
    description: '19.5" × 11" Proofgrade printable area',
  },
  {
    id: 'sheet-600x450',
    name: 'Large Sheet (600 × 450 mm)',
    widthMm: 600,
    heightMm: 450,
    description: '24" × 18" laser / flatbed cutter sheet',
  },
];

export interface MaterialPreset {
  id: string;
  name: string;
  category: BoxCategory;
  thicknessMm: number;
  kerfMm: number;
  scoreNote: string;
  colorHex: string;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: 'basswood-3mm',
    name: '3.0 mm Basswood Plywood',
    category: 'wood-finger',
    thicknessMm: 3.0,
    kerfMm: 0.12,
    scoreNote: 'xTool M2: 100% power, 5 mm/s (1 pass) cut; 25% power, 80 mm/s score',
    colorHex: '#d6b384',
  },
  {
    id: 'mdf-3mm',
    name: '3.0 mm Laser MDF',
    category: 'wood-finger',
    thicknessMm: 3.0,
    kerfMm: 0.14,
    scoreNote: 'xTool M2: 100% power, 4 mm/s cut; 30% power, 70 mm/s score',
    colorHex: '#a8845c',
  },
  {
    id: 'basswood-1.6mm',
    name: '1.6 mm (1/16") Micro Basswood',
    category: 'wood-finger',
    thicknessMm: 1.6,
    kerfMm: 0.10,
    scoreNote: 'Ideal for small jewelry boxes and tight living hinges',
    colorHex: '#dfc195',
  },
  {
    id: 'plywood-6mm',
    name: '6.0 mm Baltic Birch / MDF',
    category: 'wood-finger',
    thicknessMm: 6.0,
    kerfMm: 0.18,
    scoreNote: 'Heavy-duty crates and large organizer boxes',
    colorHex: '#c79f6d',
  },
  {
    id: 'cardboard-eflute',
    name: '1.5 mm E-Flute Corrugated Mailer',
    category: 'cardboard-fold',
    thicknessMm: 1.5,
    kerfMm: 0.10,
    scoreNote: 'Fine corrugated mailer board; score at 18% power or use 3mm/2mm perforation',
    colorHex: '#c69c6d',
  },
  {
    id: 'cardboard-bflute',
    name: '3.0 mm B-Flute Shipping Cardboard',
    category: 'cardboard-fold',
    thicknessMm: 3.0,
    kerfMm: 0.12,
    scoreNote: 'Standard shipping box flute; dashed perforation score recommended for crisp folds',
    colorHex: '#b38756',
  },
  {
    id: 'cardstock-0.6mm',
    name: '0.6 mm Chipboard / Heavy Cardstock',
    category: 'cardboard-fold',
    thicknessMm: 0.6,
    kerfMm: 0.08,
    scoreNote: 'Retail product cartons; works great with xTool M2 Inkjet Print + Blade/Laser Cut',
    colorHex: '#e6dec8',
  },
  {
    id: 'pla-petg',
    name: 'PLA / PETG (0.4mm Nozzle)',
    category: '3d-print',
    thicknessMm: 2.4,
    kerfMm: 0.0,
    scoreNote: '6 perimeters (2.4mm walls), 0.2mm layer height, no supports needed',
    colorHex: '#6366f1',
  },
];

export interface TemplateMetadata {
  id: BoxTemplateId;
  name: string;
  shortName: string;
  category: BoxCategory;
  pass: 'Pass 1 (Core)' | 'Pass 2 (Specialty)' | 'Pass 3 (3D Print)';
  tagline: string;
  description: string;
}

export const BOX_TEMPLATES: TemplateMetadata[] = [
  {
    id: 'finger-basic',
    name: '6-Panel Finger-Joint Box',
    shortName: 'Finger-Joint Box',
    category: 'wood-finger',
    pass: 'Pass 1 (Core)',
    tagline: 'Basswood & MDF box with symmetric odd finger joints & 3-way corner solver.',
    description:
      'Supports open-top trays, fully closed boxes, flat lift-off lids, and inset rimmed lids with laser kerf compensation.',
  },
  {
    id: 'finger-clamshell',
    name: 'Treasure Chest / Clamshell Box',
    shortName: 'Clamshell Chest',
    category: 'wood-finger',
    pass: 'Pass 2 (Specialty)',
    tagline: 'Split base & hinged lid with integrated laser-cut knuckle or side-pivot hinges.',
    description:
      'Generates a bottom tray and top lid connected by captive laser-cut knuckle fingers or side-wall pivot pins.',
  },
  {
    id: 'finger-living-hinge',
    name: 'Living-Hinge Curved Lid Box',
    shortName: 'Living Hinge Box',
    category: 'wood-finger',
    pass: 'Pass 2 (Specialty)',
    tagline: 'Flexible kerf-cut lattice allows rigid wood or MDF to bend around a curved lid.',
    description:
      'Computes alternating kerf slits along the wrap-around lid panel so 3mm basswood or MDF bends smoothly without snapping.',
  },
  {
    id: 'finger-organizer',
    name: 'Slotted Divider Organizer Box',
    shortName: 'Organizer Grid',
    category: 'wood-finger',
    pass: 'Pass 2 (Specialty)',
    tagline: 'Finger-joint box with parametric interlocking X × Y internal compartment dividers.',
    description:
      'Cuts alignment slots into the walls and generates matching cross-lap divider inserts.',
  },
  {
    id: 'cardboard-mailer',
    name: 'Roll-End Tuck Top Mailer (RETT)',
    shortName: 'E-Commerce Mailer',
    category: 'cardboard-fold',
    pass: 'Pass 1 (Core)',
    tagline: 'Classic 1-piece corrugated mailer box with rollover side walls, dust flaps & tuck lid.',
    description:
      'Automatically compensates fold allowances for corrugated cardboard thickness and supports continuous score or dashed perforation lines.',
  },
  {
    id: 'cardboard-tuck-carton',
    name: 'Folding Product Carton (RTE / STE)',
    shortName: 'Retail Tuck Carton',
    category: 'cardboard-fold',
    pass: 'Pass 1 (Core)',
    tagline: 'Retail packaging carton with tapered side glue tab, dust flaps & friction tuck closures.',
    description:
      'Ideal for xTool M2 print-then-cut packaging on cardstock, chipboard, or E-flute corrugated board.',
  },
  {
    id: 'cardboard-telescope',
    name: 'Two-Piece Telescoping Box (Shoebox)',
    shortName: 'Telescoping Lid Box',
    category: 'cardboard-fold',
    pass: 'Pass 2 (Specialty)',
    tagline: 'Separate folding base tray and slip-over lid with adjustable clearance tolerance.',
    description:
      'Generates both the bottom tray and oversized top lid dielines sized to slide smoothly over the base.',
  },
  {
    id: '3d-snap-box',
    name: 'Parametric 3D-Printed Snap Box',
    shortName: '3D Print Snap Box',
    category: '3d-print',
    pass: 'Pass 3 (3D Print)',
    tagline: 'Watertight 3D-printable enclosure with inner fillets, 45° bed chamfers & snap clasp.',
    description:
      'Generates a manifold 3D mesh for base and lid with customizable wall thickness, corner rounding, hinge lugs, and front latch—exportable directly to STL.',
  },
];

export interface ExportProfileConfig {
  id: ExportProfileId;
  name: string;
  badge: string;
  cutColor: string;
  scoreColor: string;
  guideColor: string;
  strokeWidthMm: number;
  dpi: number;
  notes: string;
}

export const EXPORT_PROFILES: Record<ExportProfileId, ExportProfileConfig> = {
  'xtool-studio': {
    id: 'xtool-studio',
    name: 'xTool Studio (M2 / P2 / S1)',
    badge: 'xTool M2 Print & Cut Ready',
    cutColor: '#FF0000',
    scoreColor: '#0000FF',
    guideColor: '#00AA00',
    strokeWidthMm: 0.1,
    dpi: 72,
    notes: 'Maps Red (#FF0000) to Cut, Blue (#0000FF) to Score, and embeds Artwork at 1:1 mm scale for xTool M2 Print + Cut.',
  },
  lightburn: {
    id: 'lightburn',
    name: 'LightBurn (C00 / C01 / C02)',
    badge: 'LightBurn Palette',
    cutColor: '#FF0000', // C02 Red (Cut)
    scoreColor: '#0000FF', // C01 Blue (Line/Score)
    guideColor: '#00E000', // C03 Green (Tool)
    strokeWidthMm: 0.05,
    dpi: 96,
    notes: 'Uses official LightBurn layer colors (C02 Red = Cut, C01 Blue = Score) with 96 DPI SVG / R14 DXF units.',
  },
  illustrator: {
    id: 'illustrator',
    name: 'Adobe Illustrator / Inkscape',
    badge: 'Layered PDF & SVG',
    cutColor: '#ED1C24',
    scoreColor: '#0071BC',
    guideColor: '#29ABE2',
    strokeWidthMm: 0.08,
    dpi: 72,
    notes: 'Generates true Optional Content Group (OCG) layers in PDF ("Cut Lines", "Score Lines", "Print Artwork", "Registration Marks").',
  },
  glowforge: {
    id: 'glowforge',
    name: 'Glowforge / Craft Cutters',
    badge: 'Color-Ordered SVG',
    cutColor: '#FF0000',
    scoreColor: '#0000FF',
    guideColor: '#888888',
    strokeWidthMm: 0.1,
    dpi: 96,
    notes: 'Orders Score steps (#0000FF) before Cut steps (#FF0000) so parts stay flat until scoring finishes.',
  },
};

export const DEFAULT_FACE_LABELS: Record<string, string> = {
  top: 'TOP / LID',
  bottom: 'BOTTOM',
  front: 'FRONT',
  back: 'BACK',
  left: 'LEFT',
  right: 'RIGHT',
};

export const DEFAULT_BOX_PARAMETERS: BoxParameters = {
  category: 'wood-finger',
  templateId: 'finger-basic',
  dimensionReference: 'inner',
  widthMm: 110,
  depthMm: 80,
  heightMm: 55,
  materialThicknessMm: 3.0,
  kerfMm: 0.12,
  fingerWidthMm: 12,
  woodLidStyle: 'flat-lid',
  lidHeightMm: 18,
  clamshellHingeType: 'butt-hardware',
  hingeFingerWidthMm: 8,
  includeHingeScrewHoles: true,
  hingePinDiameterMm: 2.0,
  livingHingePitchMm: 2.5,
  livingHingeAttachMode: 'one-piece-back',
  dividerCols: 2,
  dividerRows: 2,
  scoreLineMode: 'solid-score',
  perfCutMm: 3.0,
  perfGapMm: 1.5,
  tuckFlapMm: 18,
  glueFlapMm: 15,
  thumbNotch: false,
  cardboardLockStyle: 'center-tongue',
  lockTabWidthMm: 22,
  lockTabDepthMm: 9.0,
  tuckCartonStyle: 'reverse-tuck',
  telescopeClearanceMm: 1.2,
  wallThickness3dMm: 2.4,
  floorThickness3dMm: 2.0,
  innerFilletMm: 3.0,
  outerChamferMm: 1.2,
  outerFilletMm: 4.0,
  includeSnapClasp: true,
  include3dHinge: true,
  scoreInnerFaceLabels: false,
  faceLabelPosition: 'center',
  faceLabelSizeMm: 5.0,
  mirrorInnerFaceLabels: false,
  scoreFaceDimensions: false,
  showGuideLabels2D: true,
  customFaceLabels: { ...DEFAULT_FACE_LABELS },
  exportProfile: 'xtool-studio',
  svgUnitMode: 'mm',
  svgGroupingMode: 'by-layer',
  includeScaleBar: false,
  bedPresetId: 'xtool-m2',
  sheetMarginMm: 8,
  partSpacingMm: 5,
  showDimensions: true,
  includeRegistrationMarks: false,
};
