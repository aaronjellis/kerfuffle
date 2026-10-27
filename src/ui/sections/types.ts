import type React from 'react';
import type {
  BoxParameters,
  DisplayUnit,
  ExportProfileId,
  FaceArtwork,
  GeneratedBoxModel,
  TextArtworkConfig,
} from '../../engine/types';
import type { SampleArtworkPreset } from '../../engine/sampleArtworks';

/** What sections need from `App`: state and handlers that live above the inspector. */
export interface SectionHandlers {
  /** For edits that change several params at once (material preset, hand-typed thickness). */
  setParams: React.Dispatch<React.SetStateAction<BoxParameters>>;
  updateFaceLabel: (faceId: string, text: string) => void;
  setDisplayUnit: (unit: DisplayUnit) => void;
  /** Picks the export profile; xTool Studio also groups the SVG by piece. */
  selectProfile: (profile: ExportProfileId) => void;

  // Artwork
  artworks: FaceArtwork[];
  selectedFaceId: string;
  setSelectedFaceId: (faceId: string) => void;
  selectedArtworkId: string | null;
  setSelectedArtworkId: (artId: string | null) => void;
  updateArtwork: (artId: string, patch: Partial<FaceArtwork>) => void;
  removeArtwork: (artId: string) => void;
  duplicateArtwork: (art: FaceArtwork, targetFaceId?: string) => void;
  addTextArtwork: () => Promise<void>;
  updateTextConfig: (
    art: FaceArtwork,
    patch: Partial<TextArtworkConfig>,
    nextMode?: 'print' | 'engrave'
  ) => Promise<void>;
  uploadInputRef: React.RefObject<HTMLInputElement>;
  uploadArtwork: (e: React.ChangeEvent<HTMLInputElement>) => void;
  addSampleArtwork: (preset: SampleArtworkPreset) => void;
  alignArtwork: (art: FaceArtwork, anchorX?: -1 | 0 | 1, anchorY?: -1 | 0 | 1) => void;
  fitArtwork: (art: FaceArtwork, fitAxis: 'width' | 'height', ratio?: number) => void;
  alignMarginMm: number;
  setAlignMarginMm: (mm: number) => void;
  customFontInput: string;
  setCustomFontInput: (value: string) => void;

  // 3D print and printed-hinge exports
  exportHingeStl: () => void;
  downloadStl: () => void;
  downloadStlParts: () => void;

  /** Opens the kerf test in place of the inspector; absent inside the test itself. */
  openKerfTest?: () => void;
}

export interface SectionProps {
  params: BoxParameters;
  updateParam: <K extends keyof BoxParameters>(key: K, value: BoxParameters[K]) => void;
  displayUnit: DisplayUnit;
  model: GeneratedBoxModel;
  handlers: SectionHandlers;
}
