export type BoxCategory = 'wood-finger' | 'cardboard-fold' | '3d-print';

export type BoxTemplateId =
  | 'finger-basic'
  | 'finger-clamshell'
  | 'finger-living-hinge'
  | 'finger-organizer'
  | 'cardboard-mailer'
  | 'cardboard-tuck-carton'
  | 'cardboard-telescope'
  | '3d-snap-box';

export type WoodLidStyle = 'closed' | 'open' | 'flat-lid' | 'inset-lid' | 'sliding-lid';
export type ClamshellHingeType = 'butt-hardware' | 'side-pivot' | 'knuckle-pin' | 'printed-hinge';
export type LivingHingeAttachMode =
  | 'one-piece-back'
  | 'finger-joint-back'
  | 'side-arch-tabs';
export type DisplayUnit = 'mm' | 'in';
export type SvgUnitMode = 'mm' | 'in' | '96dpi' | '72dpi';
export type SvgGroupingMode = 'by-layer' | 'by-piece' | 'flat-2-objects';
export type ScoreLineMode = 'solid-score' | 'dashed-perf';
export type CardboardLockStyle = 'tuck' | 'front-lock';
export type ExportProfileId = 'xtool-studio' | 'lightburn' | 'illustrator' | 'glowforge';
export type DimensionReference = 'inner' | 'outer';
export type FaceLabelPosition = 'center' | 'bottom' | 'top-left';

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

export interface MachineBedPreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  description: string;
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
  clamshellHingeType: ClamshellHingeType;
  hingeFingerWidthMm: number;
  includeHingeScrewHoles: boolean;
  hingePinDiameterMm: number;
  livingHingePitchMm: number;
  livingHingeAttachMode: LivingHingeAttachMode;
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
  tuckCartonStyle: 'reverse-tuck' | 'straight-tuck';
  telescopeClearanceMm: number;
  /** 3D Print specific */
  wallThickness3dMm: number;
  floorThickness3dMm: number;
  innerFilletMm: number;
  outerChamferMm: number;
  outerFilletMm: number;
  includeSnapClasp: boolean;
  include3dHinge: boolean;
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
  /** Cut, score, and guide vector paths in panel-local coordinates */
  paths: DielinePath[];
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
  /** For hinged lids or folding cardboard flaps: hierarchical parent & fold axis */
  foldRig?: {
    parentId?: string;
    pivotOffset: [number, number, number];
    axis: 'x' | 'y' | 'z';
    flatAngleRad: number;
    foldedAngleRad: number;
    /** Normalized timing window [start, end] within 0..1 fold progress */
    stage: [number, number];
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
  sheetWidthMm: number;
  sheetHeightMm: number;
  fitsOnBed: boolean;
  stats: {
    totalCutLengthMm: number;
    totalScoreLengthMm: number;
    panelCount: number;
    fingerCountSummary?: string;
  };
}
