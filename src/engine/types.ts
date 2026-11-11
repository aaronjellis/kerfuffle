import type { HingePatternId } from './livingHinge';

export type BoxCategory = 'wood-finger' | 'cardboard-fold' | '3d-print';

export type BoxTemplateId =
  | 'finger-basic'
  | 'finger-clamshell'
  | 'finger-living-hinge'
  | 'finger-organizer'
  | 'finger-wine-carrier'
  | 'cardboard-mailer'
  | 'cardboard-tuck-carton'
  | 'cardboard-telescope'
  | '3d-snap-box';

export type WoodLidStyle = 'closed' | 'open' | 'flat-lid' | 'inset-lid' | 'sliding-lid' | 'telescope-lid';
export type ClamshellHingeType = 'butt-hardware' | 'side-pivot' | 'knuckle-pin' | 'printed-hinge';
export type LivingHingeAttachMode =
  | 'one-piece-back'
  | 'finger-joint-back'
  | 'side-arch-tabs';
export type DisplayUnit = 'mm' | 'in';
export type SvgUnitMode = 'mm' | 'in' | '96dpi' | '72dpi';
export type SvgGroupingMode = 'by-layer' | 'by-piece' | 'flat-2-objects';
export type ScoreLineMode = 'solid-score' | 'dashed-perf';
export type CardboardLockStyle = 'tuck' | 'front-lock' | 'fold-over';
export type ExportProfileId = 'xtool-studio' | 'lightburn' | 'illustrator' | 'glowforge';
export type DimensionReference = 'inner' | 'outer';
export type FaceLabelPosition = 'center' | 'bottom' | 'top-left';
export type FacePatternStyle =
  | 'none'
  | 'grid'
  | 'checker'
  | 'diamond'
  | 'honeycomb'
  | 'scallops'
  | 'sunflower'
  | 'spiral';

/** One face's see-through pattern. */
export interface FacePatternSettings {
  style: FacePatternStyle;
  /** The pattern's repeat */
  cellMm: number;
  /** Solid web left between neighbouring holes */
  barMm: number;
  /** Solid border between the face's edge and the pattern */
  paddingMm: number;
  /** A shape the pattern is cropped to, filling the area inside the border; none keeps it rectangular */
  crop?: PatternCrop;
}

/** Shapes a face's pattern can be cropped to: Badgerly's badge outlines. */
export type PatternCrop =
  | 'none'
  | 'rounded'
  | 'pill'
  | 'ellipse'
  | 'chamfer'
  | 'cornerCut'
  | 'ticket'
  | 'doubleRound'
  | 'scallop'
  | 'bracket'
  | 'antique'
  | 'wave';

export interface TextArtworkConfig {
  text: string;
  fontFamily: string;
  fontWeight: '400' | '600' | '700' | '800';
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  color: string;
  letterSpacingEm: number;
  lineHeight: number;
}

export interface FaceArtwork {
  id: string;
  faceId: string;
  name: string;
  /** Data URL (SVG or PNG/JPG) */
  dataUrl: string;
  /** Raw SVG string if uploaded as SVG */
  svgText?: string;
  /** Center offset from panel center in mm */
  xMm: number;
  yMm: number;
  /** Physical width and height in mm */
  widthMm: number;
  heightMm: number;
  /** Rotation in degrees */
  rotationDeg: number;
  /** Whether to treat as print artwork (full color) or laser engrave */
  mode: 'print' | 'engrave';
  /** Present when this artwork item is a live editable Google Font text layer */
  textConfig?: TextArtworkConfig;
}

/** One material sheet's place in the laid-out sheets, and the pieces on it. */
export interface SheetRegion {
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
  panelIds: string[];
}

export interface MachineBedPreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  description: string;
}

/**
 * A divider in the 3D-printed base. Coordinates are millimetres in the interior frame: origin at
 * the inner front-left corner, x across the width, y front to back. `axis` is the axis the divider
 * runs along, `pos` its centerline on the other axis. `from` and `to` are its ends along `axis`:
 * 0 or the interior extent at a wall, the supporting divider's `pos` at a divider.
 */
export interface PrintDivider {
  id: string;
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
}

export interface BoxParameters {
  category: BoxCategory;
  templateId: BoxTemplateId;
  dimensionReference: DimensionReference;
  /** Primary dimensions in mm */
  widthMm: number;
  depthMm: number;
  heightMm: number;
  /** Material & Laser */
  materialThicknessMm: number;
  kerfMm: number;
  /** The material preset the user picked; cleared when they edit the thickness by hand. */
  materialPresetId?: string;
  /** Wood Finger-Joint specific */
  fingerWidthMm: number;
  woodLidStyle: WoodLidStyle;
  lidHeightMm: number;
  /** Telescoping wood lid: the slip-fit gap between the lid's skirt and the base, per side */
  woodLidClearanceMm: number;
  /** Inner lip: score its outline under the lid, as a guide for gluing it */
  lidLipGuide: boolean;
  clamshellHingeType: ClamshellHingeType;
  hingeFingerWidthMm: number;
  includeHingeScrewHoles: boolean;
  hingePinDiameterMm: number;
  livingHingePattern: HingePatternId;
  /** Row spacing, or a lattice's line spacing or cell size */
  livingHingePitchMm: number;
  /** Slit length, for slit patterns */
  livingHingeCutMm: number;
  /** Uncut wood between slits, or at each lattice junction */
  livingHingeBridgeMm: number;
  livingHingeAttachMode: LivingHingeAttachMode;
  /** A finger hole through the lid's catch tongue, to press it home and pull it free */
  livingHingeThumbHole: boolean;
  /** The finger hole's width across the tongue */
  livingHingeThumbHoleWidthMm: number;
  /** The finger hole's height; its ends are rounded to half of it */
  livingHingeThumbHoleHeightMm: number;
  /** Loose tabs rising from the side walls into the lid's top, to hold it square unlatched */
  livingHingeTopGuides: boolean;
  dividerCols: number;
  dividerRows: number;
  /** Cardboard Fold specific */
  scoreLineMode: ScoreLineMode;
  perfCutMm: number;
  perfGapMm: number;
  tuckFlapMm: number;
  glueFlapMm: number;
  thumbNotch: boolean;
  includeLidFlaps: boolean;
  cardboardLockStyle: CardboardLockStyle;
  lockTabWidthMm: number;
  lockTabDepthMm: number;
  /** Mailer: tabs per inner side wall that lock into the floor slots */
  sideTabCount: 1 | 2;
  /** Mailer: each side tab's length along the wall; a ceiling, shortened to fit */
  sideTabLenMm: number;
  tuckCartonStyle: 'reverse-tuck' | 'straight-tuck';
  telescopeClearanceMm: number;
  /** 3D Print specific */
  wallThickness3dMm: number;
  floorThickness3dMm: number;
  innerFilletMm: number;
  outerChamferMm: number;
  outerFilletMm: number;
  includeSnapClasp: boolean;
  /** Pockets for 6 x 3 mm disc magnets in the front corners of the printed base and lid */
  include3dMagnets: boolean;
  include3dHinge: boolean;
  /** Freeform dividers in the printed base, in the interior's own frame */
  printDividers: PrintDivider[];
  /** The interior size (mm) the saved divider positions were drawn for; 0 × 0 with no layout */
  printDividersBasis: { w: number; d: number };
  /** One thickness for every divider; 0 follows the wall thickness */
  dividerThickness3dMm: number;
  /** Divider height above the floor; 0 means up to the base rim */
  dividerHeight3dMm: number;
  /** See-through pattern per face ('top', 'front', …); a face with no entry stays solid */
  facePatterns: Record<string, FacePatternSettings>;
  /** Inner Side Vector Score Face Labels */
  scoreInnerFaceLabels: boolean;
  faceLabelPosition: FaceLabelPosition;
  faceLabelSizeMm: number;
  mirrorInnerFaceLabels: boolean;
  scoreFaceDimensions: boolean;
  showGuideLabels2D: boolean;
  customFaceLabels: Record<string, string>;
  /** Export & Viewport */
  exportProfile: ExportProfileId;
  svgUnitMode: SvgUnitMode;
  svgGroupingMode: SvgGroupingMode;
  includeScaleBar: boolean;
  bedPresetId: string;
  sheetMarginMm: number;
  partSpacingMm: number;
  /** Pack wood pieces edge to edge and cut each shared straight edge once */
  shareCutLines: boolean;
  /** Cut on sheets of material smaller than the bed, as many as the pieces need */
  materialSheet: boolean;
  materialWidthMm: number;
  materialHeightMm: number;
  /** Wine carrier: the bottle it's sized from, a preset id or 'custom' */
  wineBottleId: string;
  wineBottleDiameterMm: number;
  wineBottleHeightMm: number;
  /** Height where the bottle's shoulder starts */
  wineBottleShoulderMm: number;
  /** Room around and above the bottle */
  wineClearanceMm: number;
  /** Height of the tapered shoulders; 0 sizes them to clear the bottle's neck */
  wineShoulderHeightMm: number;
  /** Arched feet cut into the bottom of the front and back */
  wineFeet: boolean;
  showDimensions: boolean;
  includeRegistrationMarks: boolean;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface DielinePath {
  id: string;
  layer: 'cut' | 'score' | 'guide';
  /** SVG path d attribute in panel-local coordinates (0,0 = top-left of panel outer box) */
  d: string;
  closed: boolean;
  /** If true, render as dashed perforation when scoreLineMode === 'dashed-perf' */
  isFoldScore?: boolean;
}

export interface BoxPanel2D {
  id: string;
  name: string;
  faceLabel: string;
  /** Outer bounding dimensions of this panel in mm */
  widthMm: number;
  heightMm: number;
  /** Inner safe area (for artwork placement & dimensioning) relative to panel origin */
  safeRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Position on the nested 2D cut sheet in mm */
  sheetX: number;
  sheetY: number;
  /** Turned a quarter turn clockwise on the sheet to fit; `placement.ts` maps its frame there. */
  quarterTurn?: boolean;
  /** Cut, score, and guide vector paths in panel-local coordinates */
  paths: DielinePath[];
  /**
   * The face's usable outline for see-through patterns, in the panel's frame, when it isn't the safe
   * rectangle: a curved wall's arch. Convex.
   */
  patternOutline?: Point2D[];
  /** Optional sub-regions for 1-piece folding cardboard so artwork can be placed on individual faces */
  subFaces?: {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
}

export interface Panel3DTransform {
  id: string;
  name: string;
  faceId: string;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  color: string;
  /** Closed position in 3D space (mm, centered at box center) */
  closedPos: [number, number, number];
  /** Exploded position in 3D space (mm) for wood assembly mode */
  explodedPos: [number, number, number];
  /** Base Euler rotation [rx, ry, rz] in radians */
  rotation: [number, number, number];
  /** Optional SVG outer contour points for extruding real finger joints in 3D */
  outlinePoints?: Point2D[];
  /** Optional interior hole contours (e.g., living hinge slits, thumb holes, knuckle slots) */
  holeContours?: Point2D[][];
  /** Open cuts drawn as lines on both faces, in the outline's frame: slits too thin to model as holes */
  surfaceLines?: Point2D[][];
  /** For hinged lids or folding cardboard flaps: hierarchical parent & fold axis */
  /**
   * A panel that bends along its length in 3D (the wine carrier's front and back): its profile up
   * the sheet's y, and the hinge slits to draw on it, in the sheet's y-down frame
   */
  bend?: { segments: import('./bentPanel').BendSegment[]; lines?: Point2D[][] };
  /** Its holes all lie outside its safe area, so a pattern there can't run into them */
  patternSafe?: boolean;
  foldRig?: {
    parentId?: string;
    pivotOffset: [number, number, number];
    axis: 'x' | 'y' | 'z';
    flatAngleRad: number;
    foldedAngleRad: number;
    /** Normalized timing window [start, end] within 0..1 fold progress */
    stage: [number, number];
    /**
     * Shift in the closed frame, applied in full while the panel lies flat and easing to zero as it
     * folds. Lets the flat rig tile like the sheet where the closed box seats a panel off its crease.
     */
    flatSlide?: [number, number, number];
  };
}

/** A box's size along its three axes, in millimeters. */
export interface BoxDims {
  widthMm: number;
  depthMm: number;
  heightMm: number;
}

export interface GeneratedBoxModel {
  params: BoxParameters;
  innerDims: BoxDims;
  /** The real outside size, as reported by the template's generator. */
  outerDims: BoxDims;
  panels2D: BoxPanel2D[];
  panels3D: Panel3DTransform[];
  /** Faces this model can take a see-through pattern on, before any is cut */
  patternFaceIds: string[];
  sheetWidthMm: number;
  sheetHeightMm: number;
  /** Whether the pieces fit one bed as Kerfuffle packs them, before any split onto sheets */
  fitsOnBed: boolean;
  /**
   * The sheets the pieces are cut from, laid out together in a grid on the sheet: one covering the
   * whole layout, or several when the material is smaller than the bed or the pieces outgrow it.
   */
  sheets: SheetRegion[];
  /** The material size the pieces are split onto, when they are; trimmed to the bed if bigger */
  sheetSize?: { widthMm: number; heightMm: number; trimmed: boolean };
  /** Pieces too big for the material sheet, each on a grown sheet of its own */
  oversizePanelIds: string[];
  stats: {
    totalCutLengthMm: number;
    totalScoreLengthMm: number;
    /** Cut length saved by cutting shared edges once, when that's on */
    sharedCutMm: number;
    panelCount: number;
    fingerCountSummary?: string;
  };
}
