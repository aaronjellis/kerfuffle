import { BoxCategory, BoxParameters, BoxTemplateId, ExportProfileId, FacePatternSettings, MachineBedPreset } from './types';

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
    name: 'Standard diode (400 × 400 mm)',
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
    name: 'Large sheet (600 × 450 mm)',
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
  /** Laser settings: power in %, speed in mm/s. Starting values; confirm with a test cut. */
  laser: {
    cutPower: number;
    cutSpeed: number;
    cutPasses: number;
    scorePower: number;
    scoreSpeed: number;
  };
  colorHex: string;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: 'basswood-3mm',
    name: '3.0 mm basswood plywood',
    category: 'wood-finger',
    thicknessMm: 3.0,
    kerfMm: 0.12,
    scoreNote: 'Starting values for the xTool M2; confirm with a test cut',
    laser: { cutPower: 100, cutSpeed: 5, cutPasses: 1, scorePower: 25, scoreSpeed: 80 },
    colorHex: '#d6b384',
  },
  {
    id: 'mdf-3mm',
    name: '3.0 mm laser MDF',
    category: 'wood-finger',
    thicknessMm: 3.0,
    kerfMm: 0.14,
    scoreNote: 'Starting values for the xTool M2; confirm with a test cut',
    laser: { cutPower: 100, cutSpeed: 4, cutPasses: 1, scorePower: 30, scoreSpeed: 70 },
    colorHex: '#a8845c',
  },
  {
    id: 'basswood-1.6mm',
    name: '1.6 mm (1/16") basswood',
    category: 'wood-finger',
    thicknessMm: 1.6,
    kerfMm: 0.10,
    scoreNote: 'Ideal for small jewelry boxes and tight living hinges',
    laser: { cutPower: 100, cutSpeed: 8, cutPasses: 1, scorePower: 20, scoreSpeed: 90 },
    colorHex: '#dfc195',
  },
  {
    id: 'plywood-6mm',
    name: '6.0 mm Baltic birch or MDF',
    category: 'wood-finger',
    thicknessMm: 6.0,
    kerfMm: 0.18,
    scoreNote: 'Heavy-duty crates and large organizer boxes',
    laser: { cutPower: 100, cutSpeed: 3, cutPasses: 2, scorePower: 30, scoreSpeed: 70 },
    colorHex: '#c79f6d',
  },
  {
    id: 'cardboard-eflute',
    name: '1.5 mm E-flute corrugated',
    category: 'cardboard-fold',
    thicknessMm: 1.5,
    kerfMm: 0.10,
    scoreNote: 'Fine corrugated mailer board; or use 3mm/2mm perforation',
    laser: { cutPower: 90, cutSpeed: 10, cutPasses: 1, scorePower: 18, scoreSpeed: 100 },
    colorHex: '#c69c6d',
  },
  {
    id: 'cardboard-bflute',
    name: '3.0 mm B-flute shipping cardboard',
    category: 'cardboard-fold',
    thicknessMm: 3.0,
    kerfMm: 0.12,
    scoreNote: 'Standard shipping box flute; dashed perforation score recommended for crisp folds',
    laser: { cutPower: 100, cutSpeed: 6, cutPasses: 1, scorePower: 22, scoreSpeed: 90 },
    colorHex: '#b38756',
  },
  {
    id: 'cardstock-0.6mm',
    name: '0.6 mm chipboard or heavy cardstock',
    category: 'cardboard-fold',
    thicknessMm: 0.6,
    kerfMm: 0.08,
    scoreNote: 'Retail product cartons; works great with xTool M2 Inkjet Print + Blade/Laser Cut',
    laser: { cutPower: 80, cutSpeed: 15, cutPasses: 1, scorePower: 15, scoreSpeed: 120 },
    colorHex: '#e6dec8',
  },
  {
    id: 'pla-petg',
    name: 'PLA or PETG (0.4 mm nozzle)',
    category: '3d-print',
    thicknessMm: 2.4,
    kerfMm: 0.0,
    scoreNote: '6 perimeters (2.4mm walls), 0.2mm layer height, no supports needed',
    laser: { cutPower: 0, cutSpeed: 0, cutPasses: 0, scorePower: 0, scoreSpeed: 0 },
    colorHex: '#6366f1',
  },
];

/**
 * The material preset a box uses. The chosen preset (`materialPresetId`) wins and is exact;
 * else a preset of the box's category within 0.01 mm of its thickness (exact); else the
 * nearest thicker preset in the category, else the category's thickest (both not exact);
 * else the first preset.
 */
export function materialPresetFor(params: BoxParameters): { preset: MaterialPreset; exact: boolean } {
  const chosen = params.materialPresetId
    ? MATERIAL_PRESETS.find((m) => m.id === params.materialPresetId)
    : undefined;
  if (chosen) return { preset: chosen, exact: true };

  const t = params.materialThicknessMm;
  const inCategory = MATERIAL_PRESETS.filter((m) => m.category === params.category);
  const match = inCategory.find((m) => Math.abs(m.thicknessMm - t) <= 0.01);
  if (match) return { preset: match, exact: true };

  const byThickness = [...inCategory].sort((a, b) => a.thicknessMm - b.thicknessMm);
  const thicker = byThickness.find((m) => m.thicknessMm >= t);
  if (thicker) return { preset: thicker, exact: false };
  const thickest = byThickness[byThickness.length - 1];
  if (thickest) return { preset: thickest, exact: false };
  return { preset: MATERIAL_PRESETS[0], exact: false };
}

/** Laser settings for the box's material preset (see `materialPresetFor`). */
export function laserSettingsFor(params: BoxParameters): MaterialPreset['laser'] {
  return materialPresetFor(params).preset.laser;
}

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
    name: 'Six-panel finger-joint box',
    shortName: 'Finger-joint box',
    category: 'wood-finger',
    pass: 'Pass 1 (Core)',
    tagline: 'Basswood & MDF box with symmetric odd finger joints & 3-way corner solver.',
    description:
      'Supports open-top trays, fully closed boxes, flat lift-off lids, and inset rimmed lids with laser kerf compensation.',
  },
  {
    id: 'finger-clamshell',
    name: 'Treasure chest or clamshell box',
    shortName: 'Clamshell chest',
    category: 'wood-finger',
    pass: 'Pass 2 (Specialty)',
    tagline: 'Split base & hinged lid with integrated laser-cut knuckle or side-pivot hinges.',
    description:
      'Generates a bottom tray and top lid connected by captive laser-cut knuckle fingers or side-wall pivot pins.',
  },
  {
    id: 'finger-living-hinge',
    name: 'Living-hinge box with a curved lid',
    shortName: 'Living-hinge box',
    category: 'wood-finger',
    pass: 'Pass 2 (Specialty)',
    tagline: 'Flexible kerf-cut lattice allows rigid wood or MDF to bend around a curved lid.',
    description:
      'Computes alternating kerf slits along the wrap-around lid panel so 3mm basswood or MDF bends smoothly without snapping.',
  },
  {
    id: 'finger-organizer',
    name: 'Organizer box with slotted dividers',
    shortName: 'Organizer grid',
    category: 'wood-finger',
    pass: 'Pass 2 (Specialty)',
    tagline: 'Finger-joint box with parametric interlocking X × Y internal compartment dividers.',
    description:
      'Cuts alignment slots into the walls and generates matching cross-lap divider inserts.',
  },
  {
    id: 'cardboard-mailer',
    name: 'Roll-end tuck-top mailer (RETT)',
    shortName: 'Mailer',
    category: 'cardboard-fold',
    pass: 'Pass 1 (Core)',
    tagline: 'Classic 1-piece corrugated mailer box with rollover side walls, dust flaps & tuck lid.',
    description:
      'Automatically compensates fold allowances for corrugated cardboard thickness and supports continuous score or dashed perforation lines.',
  },
  {
    id: 'cardboard-tuck-carton',
    name: 'Folding product carton (RTE or STE)',
    shortName: 'Tuck carton',
    category: 'cardboard-fold',
    pass: 'Pass 1 (Core)',
    tagline: 'Retail packaging carton with tapered side glue tab, dust flaps & friction tuck closures.',
    description:
      'Ideal for xTool M2 print-then-cut packaging on cardstock, chipboard, or E-flute corrugated board.',
  },
  {
    id: 'cardboard-telescope',
    name: 'Two-piece telescoping box (shoebox)',
    shortName: 'Telescoping box',
    category: 'cardboard-fold',
    pass: 'Pass 2 (Specialty)',
    tagline: 'Separate folding base tray and slip-over lid with adjustable clearance tolerance.',
    description:
      'Generates both the bottom tray and oversized top lid dielines sized to slide smoothly over the base.',
  },
  {
    id: '3d-snap-box',
    name: '3D-printed snap box',
    shortName: 'Snap box',
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
    badge: 'Ready for xTool M2 print and cut',
    cutColor: '#FF0000',
    scoreColor: '#0000FF',
    guideColor: '#00AA00',
    strokeWidthMm: 0.1,
    dpi: 72,
    notes: 'Red (#FF0000) cuts, blue (#0000FF) scores, and artwork is embedded at 1:1 mm for xTool M2 print and cut.',
  },
  lightburn: {
    id: 'lightburn',
    name: 'LightBurn (C00 / C01 / C02)',
    badge: 'LightBurn palette',
    cutColor: '#FF0000', // C02 Red (Cut)
    scoreColor: '#0000FF', // C01 Blue (Line/Score)
    guideColor: '#00E000', // C03 Green (Tool)
    strokeWidthMm: 0.05,
    dpi: 96,
    notes: 'LightBurn layer colors (C02 red cuts, C01 blue scores), with 96 DPI SVG and R14 DXF units.',
  },
  illustrator: {
    id: 'illustrator',
    name: 'Adobe Illustrator / Inkscape',
    badge: 'Layered PDF and SVG',
    cutColor: '#ED1C24',
    scoreColor: '#0071BC',
    guideColor: '#29ABE2',
    strokeWidthMm: 0.08,
    dpi: 72,
    notes: 'PDF layers (optional content groups) for cut lines, score lines, print artwork and registration marks.',
  },
  glowforge: {
    id: 'glowforge',
    name: 'Glowforge / Craft Cutters',
    badge: 'Color-ordered SVG',
    cutColor: '#FF0000',
    scoreColor: '#0000FF',
    guideColor: '#888888',
    strokeWidthMm: 0.1,
    dpi: 96,
    notes: 'Score steps (#0000FF) run before cut steps (#FF0000), so parts stay flat until scoring finishes.',
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

/** The settings a face starts from when it first gets a pattern and no other face has one. */
export const DEFAULT_FACE_PATTERN: Omit<FacePatternSettings, 'style'> = { cellMm: 14, barMm: 3, paddingMm: 8 };

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
  woodLidClearanceMm: 0.5,
  clamshellHingeType: 'butt-hardware',
  hingeFingerWidthMm: 8,
  includeHingeScrewHoles: true,
  hingePinDiameterMm: 1.75,
  livingHingePattern: 'straight',
  livingHingePitchMm: 2.5,
  livingHingeCutMm: 30,
  livingHingeBridgeMm: 3.5,
  livingHingeAttachMode: 'one-piece-back',
  dividerCols: 2,
  dividerRows: 2,
  scoreLineMode: 'solid-score',
  perfCutMm: 3.0,
  perfGapMm: 1.5,
  tuckFlapMm: 30,
  glueFlapMm: 15,
  thumbNotch: true,
  includeLidFlaps: true,
  cardboardLockStyle: 'front-lock',
  lockTabWidthMm: 14,
  lockTabDepthMm: 30,
  sideTabCount: 2,
  sideTabLenMm: 12,
  facePatterns: {},
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
  svgGroupingMode: 'by-piece',
  includeScaleBar: false,
  bedPresetId: 'xtool-m2',
  sheetMarginMm: 8,
  partSpacingMm: 5,
  showDimensions: true,
  includeRegistrationMarks: false,
};
