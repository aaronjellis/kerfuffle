import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BoxCategory,
  BoxParameters,
  BoxTemplateId,
  DisplayUnit,
  ExportProfileId,
  FaceArtwork,
  TextArtworkConfig,
} from './engine/types';
import {
  BOX_TEMPLATES,
  DEFAULT_BOX_PARAMETERS,
  DEFAULT_FACE_LABELS,
  MATERIAL_PRESETS,
} from './engine/presets';
import { generateBoxModel } from './engine/boxGenerator';
import { generateKerfTestModel, kerfTestValues } from './engine/kerfTest';
import { parseProject, PROJECT_EXTENSION, ProjectFileError, serializeProject } from './engine/projectFile';
import { exportPrintedHingeStl } from './engine/printedHinge';
import {
  export3DPrintBoxStl,
  export3DPrintBoxStlParts,
  exportBoxDxf,
  exportBoxPdf,
  exportBoxSvg,
  exportXcsProject,
} from './engine/exporters';
import { createSampleArtworkDataUrl, SampleArtworkPreset } from './engine/sampleArtworks';
import {
  computePieceAlignmentOffset,
  DEFAULT_TEXT_ARTWORK_CONFIG,
  loadGoogleFont,
  preloadCuratedGoogleFonts,
  renderTextArtworkToDataUrl,
  resolvePieceDimensions,
} from './engine/googleFonts';
import { partForMesh, partsForTemplate, reconcileSelection, type PartId } from './ui/parts';
import type { SectionHandlers } from './ui/sections';
import { ANALYTICS_PROJECT } from './ui/analytics';
import { AppBar } from './ui/AppBar';
import { Inspector } from './ui/Inspector';
import { KerfTestPanel } from './ui/KerfTestPanel';
import { Stage, type ViewMode } from './ui/Stage';
import { withPrintedPinClamp } from './ui/paramRules';

/** Set once the kerf test is finished or skipped, so it opens by itself only on a first visit. */
const ONBOARDED_KEY = 'kerfuffle.kerf-test-done';

const readOnboarded = () => {
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
};

const markOnboarded = () => {
  try {
    window.localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    // Private windows and blocked storage: the test just opens again next visit.
  }
};

/** The material and kerf the kerf test settled on, so later visits start from them. */
const FIT_KEY = 'kerfuffle.kerf-test-fit';
type StoredFit = Pick<BoxParameters, 'materialThicknessMm' | 'kerfMm' | 'materialPresetId'>;

const readFit = (): Partial<StoredFit> => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(FIT_KEY) ?? 'null');
    if (!raw || typeof raw.kerfMm !== 'number' || typeof raw.materialThicknessMm !== 'number') return {};
    return { kerfMm: raw.kerfMm, materialThicknessMm: raw.materialThicknessMm, materialPresetId: raw.materialPresetId };
  } catch {
    return {};
  }
};

const saveFit = (fit: StoredFit) => {
  try {
    window.localStorage.setItem(FIT_KEY, JSON.stringify(fit));
  } catch {
    // Storage blocked: the fit holds for this visit only.
  }
};

/** The kerf test while it is open: how far the values are shifted, and the side picked as best. */
interface KerfTestState {
  shift: number;
  picked: number | null;
}

export const App: React.FC = () => {
  // The default box is a wood one, which is what the kerf test measures.
  const [params, setParams] = useState<BoxParameters>(() => ({ ...DEFAULT_BOX_PARAMETERS, ...readFit() }));
  const [artworks, setArtworks] = useState<FaceArtwork[]>([]);
  const [selectedFaceId, setSelectedFaceId] = useState<string>('top');
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>('mm');
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [settingQuery, setSettingQuery] = useState<string>('');
  /** The one open inspector section; null when the user closed it. */
  const [selectedPart, setSelectedPart] = useState<PartId | null>('size');
  /** Asks the inspector to scroll a part's chip and section into view; `n` makes a repeat count. */
  const [scrollRequest, setScrollRequest] = useState<{ id: PartId; n: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  // A project is unsaved when its box or artwork differs from the last one saved, opened or started.
  const snapshot = useMemo(() => JSON.stringify({ params, artworks }), [params, artworks]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const unsaved = snapshot !== savedSnapshot;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  const model = useMemo(() => generateBoxModel(params), [params]);

  const [kerfTest, setKerfTest] = useState<KerfTestState | null>(() =>
    readOnboarded() ? null : { shift: 0, picked: null }
  );
  // The values follow the material's kerf until a side is picked; the kerf itself changes only on Use.
  const kerfValues = useMemo(
    () => (kerfTest ? kerfTestValues(params.kerfMm, kerfTest.shift) : []),
    [kerfTest, params.kerfMm]
  );
  // A material change moves the values; a pick that is no longer among them no longer counts.
  const kerfPicked = kerfTest?.picked != null && kerfValues.includes(kerfTest.picked) ? kerfTest.picked : null;
  const kerfTestModel = useMemo(() => {
    if (!kerfTest) return null;
    const dock = kerfPicked === null ? 2 : kerfValues.indexOf(kerfPicked);
    return generateKerfTestModel(params, kerfValues, dock);
  }, [kerfTest, kerfValues, kerfPicked, params]);
  /** What the stage shows and the exports cut: the test pieces while the test is open. */
  const activeModel = kerfTestModel ?? model;

  const openKerfTest = () => {
    setKerfTest({ shift: 0, picked: null });
    window.posthog?.capture('kerf_test_opened', { project: ANALYTICS_PROJECT });
  };
  const closeKerfTest = (outcome: 'used' | 'skipped') => {
    if (outcome === 'used' && kerfPicked !== null) {
      updateParam('kerfMm', kerfPicked);
      saveFit({
        kerfMm: kerfPicked,
        materialThicknessMm: params.materialThicknessMm,
        materialPresetId: params.materialPresetId,
      });
    }
    markOnboarded();
    setKerfTest(null);
    window.posthog?.capture('kerf_test_closed', { outcome, project: ANALYTICS_PROJECT });
  };

  const updateParam = <K extends keyof BoxParameters>(
    key: K,
    value: BoxParameters[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  /** xTool Studio imports one group per piece cleanly, so picking it also groups the SVG by piece. */
  const handleSelectProfile = (exportProfile: ExportProfileId) => {
    setParams((prev) => ({
      ...prev,
      exportProfile,
      ...(exportProfile === 'xtool-studio' ? { svgGroupingMode: 'by-piece' as const } : {}),
    }));
  };

  const updateFaceLabel = (faceId: string, text: string) => {
    setParams((prev) => ({
      ...prev,
      customFaceLabels: {
        ...(prev.customFaceLabels || DEFAULT_FACE_LABELS),
        [faceId]: text,
      },
    }));
  };

  // A part the new template lacks falls back to Size.
  useEffect(() => {
    setSelectedPart((prev) => reconcileSelection(prev, params.templateId, params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.templateId]);

  const query = settingQuery.trim().toLowerCase();
  const parts = partsForTemplate(params.templateId, params);
  // A search shows only the matching parts, each one open.
  const visibleParts = query
    ? parts.filter((p) => p.keywords.toLowerCase().includes(query) || p.label.toLowerCase().includes(query))
    : parts;

  const handleTogglePart = (id: PartId) => {
    if (query) {
      setSettingQuery('');
      setSelectedPart(id);
      return;
    }
    setSelectedPart((prev) => (prev === id ? null : id));
  };

  /**
   * A chip or a pick on the stage always opens its part, clears the search so the section
   * shows, and scrolls the chip and the section into view.
   */
  const handleSelectPart = (id: PartId) => {
    setSettingQuery('');
    setSelectedPart(id);
    setScrollRequest((prev) => ({ id, n: (prev?.n ?? 0) + 1 }));
  };

  /** A pick on the stage, in 3D or 2D: opens the part and reports it. */
  const pickPart = (part: PartId, view: '3d' | '2d') => {
    handleSelectPart(part);
    window.posthog?.capture('part_selected', { part, view, template: params.templateId, project: ANALYTICS_PROJECT });
  };

  /** A click on a 3D mesh opens the part it belongs to; a face also becomes the artwork target. */
  const handleSelectMeshPart = (meshPartId: string) => {
    if (kerfTest) return;
    const part = partForMesh(meshPartId, params.templateId);
    if (!part) return;
    if (part === 'artwork') setSelectedFaceId(meshPartId);
    pickPart(part, '3d');
  };

  /** A face or an artwork picked in 2D becomes the artwork target app-wide: Artwork opens and 3D highlights it. */
  const handlePickFace2D = (faceId: string) => {
    // A drag on the artwork already selected is not a new pick: no second part_selected, search clear or scroll.
    if (kerfTest || (faceId === selectedFaceId && selectedPart === 'artwork')) return;
    setSelectedFaceId(faceId);
    pickPart('artwork', '2d');
  };

  // Switch category & pick first template in that category
  const handleSelectCategory = (cat: BoxCategory) => {
    const firstTemplate =
      BOX_TEMPLATES.find((t) => t.category === cat)?.id || 'finger-basic';
    const matchingMaterial = MATERIAL_PRESETS.find((m) => m.category === cat);
    setParams((prev) =>
      withPrintedPinClamp({
        ...prev,
        category: cat,
        templateId: firstTemplate,
        materialThicknessMm: matchingMaterial
          ? matchingMaterial.thicknessMm
          : prev.materialThicknessMm,
        kerfMm: matchingMaterial ? matchingMaterial.kerfMm : prev.kerfMm,
        // A preset picked for another category no longer applies.
        materialPresetId: undefined,
      })
    );
    // A category switch picks that category's first template, which is a template change.
    if (firstTemplate !== params.templateId) {
      window.posthog?.capture('template_changed', { template: firstTemplate, project: ANALYTICS_PROJECT });
    }
  };

  const handleSelectTemplate = (templateId: BoxTemplateId) => {
    const meta = BOX_TEMPLATES.find((t) => t.id === templateId);
    if (!meta) return;
    const matchingMaterial = MATERIAL_PRESETS.find(
      (m) => m.category === meta.category
    );
    setParams((prev) =>
      withPrintedPinClamp({
        ...prev,
        category: meta.category,
        templateId,
        materialThicknessMm:
          prev.category !== meta.category && matchingMaterial
            ? matchingMaterial.thicknessMm
            : prev.materialThicknessMm,
        kerfMm:
          prev.category !== meta.category && matchingMaterial
            ? matchingMaterial.kerfMm
            : prev.kerfMm,
        materialPresetId:
          prev.category !== meta.category ? undefined : prev.materialPresetId,
      })
    );
    if (templateId !== params.templateId) {
      window.posthog?.capture('template_changed', { template: templateId, project: ANALYTICS_PROJECT });
    }
  };

  const [alignMarginMm, setAlignMarginMm] = useState<number>(4);
  const [customFontInput, setCustomFontInput] = useState<string>('');

  // Preload curated Google Fonts so font dropdown and canvas render immediately
  useEffect(() => {
    preloadCuratedGoogleFonts();
  }, []);

  // Artwork & Google Font Text management
  const handleAddTextArtwork = async () => {
    const initialConfig: TextArtworkConfig = { ...DEFAULT_TEXT_ARTWORK_CONFIG };
    await loadGoogleFont(initialConfig.fontFamily);
    const { dataUrl, aspectRatio } = renderTextArtworkToDataUrl(initialConfig, 'engrave');
    const pieceDims = resolvePieceDimensions(model, selectedFaceId);
    const targetW = Math.max(18, Math.min(85, Math.round(pieceDims.widthMm * 0.65)));
    const targetH = Math.max(8, Number((targetW / aspectRatio).toFixed(1)));
    const newArt: FaceArtwork = {
      id: `text-${Date.now()}`,
      faceId: selectedFaceId,
      name: `Text: ${initialConfig.text.split('\n')[0].slice(0, 18)}`,
      dataUrl,
      xMm: 0,
      yMm: 0,
      widthMm: targetW,
      heightMm: targetH,
      rotationDeg: 0,
      mode: 'engrave',
      textConfig: initialConfig,
    };
    setArtworks((prev) => [...prev, newArt]);
    setSelectedArtworkId(newArt.id);
  };

  const handleUpdateTextConfig = async (
    art: FaceArtwork,
    patch: Partial<TextArtworkConfig>,
    nextMode?: 'print' | 'engrave'
  ) => {
    const baseCfg = art.textConfig || DEFAULT_TEXT_ARTWORK_CONFIG;
    const mergedCfg: TextArtworkConfig = { ...baseCfg, ...patch };
    const modeToUse = nextMode || art.mode;

    if (patch.fontFamily && patch.fontFamily !== baseCfg.fontFamily) {
      await loadGoogleFont(patch.fontFamily);
    }

    const { dataUrl, aspectRatio } = renderTextArtworkToDataUrl(mergedCfg, modeToUse);
    const firstLine = (mergedCfg.text || 'Text').split(/\r?\n/)[0].trim() || 'Text';
    const nextHeightMm = Math.max(5, Number((art.widthMm / aspectRatio).toFixed(1)));

    updateArtwork(art.id, {
      name: `Text: ${firstLine.slice(0, 18)}`,
      dataUrl,
      heightMm: nextHeightMm,
      mode: modeToUse,
      textConfig: mergedCfg,
    });
  };

  const handleAlignToPiece = (
    art: FaceArtwork,
    anchorX?: -1 | 0 | 1,
    anchorY?: -1 | 0 | 1
  ) => {
    const pieceDims = resolvePieceDimensions(model, art.faceId);
    const { xMm, yMm } = computePieceAlignmentOffset({
      pieceWidthMm: pieceDims.widthMm,
      pieceHeightMm: pieceDims.heightMm,
      artWidthMm: art.widthMm,
      artHeightMm: art.heightMm,
      rotationDeg: art.rotationDeg,
      currentXMm: art.xMm,
      currentYMm: art.yMm,
      anchorX,
      anchorY,
      marginMm: alignMarginMm,
    });
    updateArtwork(art.id, { xMm, yMm });
  };

  const handleFitToPiece = (art: FaceArtwork, fitAxis: 'width' | 'height', ratio = 0.78) => {
    const pieceDims = resolvePieceDimensions(model, art.faceId);
    const aspect = Math.max(0.1, art.widthMm / Math.max(1, art.heightMm));
    if (fitAxis === 'width') {
      const nextW = Math.max(8, Number((pieceDims.widthMm * ratio).toFixed(1)));
      const nextH = Math.max(5, Number((nextW / aspect).toFixed(1)));
      updateArtwork(art.id, { widthMm: nextW, heightMm: nextH, xMm: 0 });
    } else {
      const nextH = Math.max(6, Number((pieceDims.heightMm * ratio).toFixed(1)));
      const nextW = Math.max(8, Number((nextH * aspect).toFixed(1)));
      updateArtwork(art.id, { widthMm: nextW, heightMm: nextH, yMm: 0 });
    }
  };

  const handleDuplicateArtwork = (art: FaceArtwork, targetFaceId?: string) => {
    const destFace = targetFaceId || art.faceId;
    const copy: FaceArtwork = {
      ...art,
      id: `art-${Date.now()}`,
      faceId: destFace,
      name: `${art.name} (Copy)`,
      xMm: destFace === art.faceId ? Number((art.xMm + 5).toFixed(1)) : art.xMm,
      yMm: destFace === art.faceId ? Number((art.yMm + 5).toFixed(1)) : art.yMm,
      textConfig: art.textConfig ? { ...art.textConfig } : undefined,
    };
    setArtworks((prev) => [...prev, copy]);
    setSelectedFaceId(destFace);
    setSelectedArtworkId(copy.id);
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const defaultSize = Math.min(
        model.innerDims.widthMm * 0.5,
        model.innerDims.depthMm * 0.5,
        60
      );
      const newArt: FaceArtwork = {
        id: `art-${Date.now()}`,
        faceId: selectedFaceId,
        name: file.name.replace(/\.[^.]+$/, ''),
        dataUrl,
        xMm: 0,
        yMm: 0,
        widthMm: Math.round(defaultSize),
        heightMm: Math.round(defaultSize),
        rotationDeg: 0,
        mode: 'print',
      };
      setArtworks((prev) => [...prev, newArt]);
      setSelectedArtworkId(newArt.id);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAddSampleStamp = (preset: SampleArtworkPreset) => {
    const newArt: FaceArtwork = {
      id: `art-${Date.now()}`,
      faceId: selectedFaceId,
      name: preset.name,
      dataUrl: createSampleArtworkDataUrl(preset),
      svgText: preset.svgText,
      xMm: 0,
      yMm: 0,
      widthMm: Math.min(preset.defaultWidthMm, Math.round(model.innerDims.widthMm * 0.7)),
      heightMm: Math.min(preset.defaultHeightMm, Math.round(model.innerDims.depthMm * 0.7)),
      rotationDeg: 0,
      mode: 'print',
    };
    setArtworks((prev) => [...prev, newArt]);
    setSelectedArtworkId(newArt.id);
  };

  const updateArtwork = (artId: string, patch: Partial<FaceArtwork>) => {
    setArtworks((prev) =>
      prev.map((a) => (a.id === artId ? { ...a, ...patch } : a))
    );
  };

  const removeArtwork = (artId: string) => {
    setArtworks((prev) => prev.filter((a) => a.id !== artId));
    if (selectedArtworkId === artId) {
      setSelectedArtworkId(null);
    }
  };

  // Export triggers
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const slugBase = kerfTestModel
    ? `kerfuffle-kerf-test-${params.materialThicknessMm.toFixed(2)}mm`
    : `kerfuffle-${params.templateId}-${Math.round(model.innerDims.widthMm)}x${Math.round(model.innerDims.depthMm)}x${Math.round(model.innerDims.heightMm)}mm`;
  /** The test pieces carry no artwork. */
  const activeArtworks = kerfTestModel ? [] : artworks;

  const confirmDiscard = () =>
    !unsaved || window.confirm('Your changes to this box aren’t saved. Continue and lose them?');

  /** Puts a project on screen and counts it as saved. */
  const loadProject = (next: BoxParameters, nextArtworks: FaceArtwork[]) => {
    setParams(next);
    setArtworks(nextArtworks);
    setSelectedArtworkId(null);
    setSelectedFaceId('top');
    setSelectedPart('size');
    setSettingQuery('');
    setSavedSnapshot(JSON.stringify({ params: next, artworks: nextArtworks }));
  };

  /** A new project starts from the default box, with the kerf test's fit if there is one. */
  const handleNewProject = () => {
    if (!confirmDiscard()) return;
    loadProject({ ...DEFAULT_BOX_PARAMETERS, ...readFit() }, []);
    window.posthog?.capture('project_new', { project: ANALYTICS_PROJECT });
  };

  const handleSaveProject = () => {
    const box = `kerfuffle-${params.templateId}-${Math.round(model.innerDims.widthMm)}x${Math.round(model.innerDims.depthMm)}x${Math.round(model.innerDims.heightMm)}mm`;
    triggerDownload(
      new Blob([serializeProject({ params, artworks, displayUnit })], { type: 'application/json' }),
      `${box}${PROJECT_EXTENSION}`
    );
    setSavedSnapshot(snapshot);
    window.posthog?.capture('project_saved', { template: params.templateId, project: ANALYTICS_PROJECT });
  };

  const handleOpenProject = () => {
    if (!confirmDiscard()) return;
    projectInputRef.current?.click();
  };

  const handleProjectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const project = parseProject(await file.text());
      setKerfTest(null);
      setDisplayUnit(project.displayUnit);
      loadProject(project.params, project.artworks);
      window.posthog?.capture('project_opened', { template: project.params.templateId, project: ANALYTICS_PROJECT });
    } catch (err) {
      window.alert(err instanceof ProjectFileError ? err.message : 'This file couldn’t be opened.');
    }
  };

  // ⌘S / Ctrl+S saves and ⌘O / Ctrl+O opens, in place of the browser's own save and open.
  const shortcutsRef = useRef({ save: handleSaveProject, open: handleOpenProject });
  shortcutsRef.current = { save: handleSaveProject, open: handleOpenProject };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        shortcutsRef.current.save();
      } else if (key === 'o') {
        e.preventDefault();
        shortcutsRef.current.open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleDownloadSvg = (layerFilter: 'all' | 'score-only' | 'cut-only' = 'all') => {
    const svg = exportBoxSvg(activeModel, activeArtworks, layerFilter);
    const suffix = layerFilter === 'score-only' ? '-score' : layerFilter === 'cut-only' ? '-cut' : '';
    triggerDownload(
      new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      `${slugBase}-${params.exportProfile}${suffix}.svg`
    );
  };

  // A 3D-print box has no laser settings (its preset is all zeros), so it gets no .xcs.
  const showXcsExport =
    params.exportProfile === 'xtool-studio' &&
    params.category !== '3d-print' &&
    import.meta.env.VITE_XCS_EXPORT === '1';

  const handleDownloadXcs = () => {
    triggerDownload(
      new Blob([exportXcsProject(activeModel)], { type: 'application/json' }),
      `${slugBase}.xcs`
    );
  };

  const handleDownloadSplitSvg = () => {
    handleDownloadSvg('score-only');
    setTimeout(() => {
      handleDownloadSvg('cut-only');
    }, 250);
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      const pdfBytes = await exportBoxPdf(activeModel, activeArtworks);
      triggerDownload(
        new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
        `${slugBase}-${params.exportProfile}.pdf`
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadDxf = () => {
    const dxf = exportBoxDxf(activeModel);
    triggerDownload(
      new Blob([dxf], { type: 'application/dxf' }),
      `${slugBase}.dxf`
    );
  };

  const handleDownloadStl = () => {
    const stl = export3DPrintBoxStl(params);
    triggerDownload(
      new Blob([stl], { type: 'model/stl' }),
      `${slugBase}-3dprint.stl`
    );
  };

  const handleDownloadHingeStl = () => {
    const stl = exportPrintedHingeStl(params, model.innerDims.widthMm);
    triggerDownload(new Blob([stl], { type: 'model/stl' }), `${slugBase}-hinge.stl`);
  };

  const handleDownloadStlParts = () => {
    const { base, lid } = export3DPrintBoxStlParts(params);
    triggerDownload(new Blob([base], { type: 'model/stl' }), `${slugBase}-base.stl`);
    triggerDownload(new Blob([lid], { type: 'model/stl' }), `${slugBase}-lid.stl`);
  };

  const sectionHandlers: SectionHandlers = {
    setParams,
    updateFaceLabel,
    setDisplayUnit,
    selectProfile: handleSelectProfile,
    artworks,
    selectedFaceId,
    setSelectedFaceId,
    selectedArtworkId,
    setSelectedArtworkId,
    updateArtwork,
    removeArtwork,
    duplicateArtwork: handleDuplicateArtwork,
    addTextArtwork: handleAddTextArtwork,
    updateTextConfig: handleUpdateTextConfig,
    uploadInputRef: fileInputRef,
    uploadArtwork: handleUploadFile,
    addSampleArtwork: handleAddSampleStamp,
    alignArtwork: handleAlignToPiece,
    fitArtwork: handleFitToPiece,
    alignMarginMm,
    setAlignMarginMm,
    customFontInput,
    setCustomFontInput,
    exportHingeStl: handleDownloadHingeStl,
    downloadStl: handleDownloadStl,
    downloadStlParts: handleDownloadStlParts,
    openKerfTest,
  };
  const sectionProps = { params, updateParam, displayUnit, model, handlers: sectionHandlers };

  return (
    <div className="app">
      <AppBar
        category={params.category}
        onSelectCategory={handleSelectCategory}
        displayUnit={displayUnit}
        onSelectUnit={setDisplayUnit}
        projectMenu={{ onNew: handleNewProject, onOpen: handleOpenProject, onSave: handleSaveProject, unsaved }}
        exportMenu={{
          params,
          onSelectProfile: handleSelectProfile,
          showXcsExport,
          isExportingPdf,
          handlers: {
            svg: () => handleDownloadSvg('all'),
            splitSvg: handleDownloadSplitSvg,
            pdf: handleDownloadPdf,
            dxf: handleDownloadDxf,
            xcs: handleDownloadXcs,
            stl: handleDownloadStl,
            stlParts: handleDownloadStlParts,
            hingeStl: handleDownloadHingeStl,
          },
        }}
      />
      <input
        ref={projectInputRef}
        type="file"
        accept={`${PROJECT_EXTENSION},application/json`}
        className="visually-hidden-input"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleProjectFile}
      />
      <div className="app-body">
        <Stage
          model={activeModel}
          params={params}
          artworks={activeArtworks}
          displayUnit={displayUnit}
          viewMode={viewMode}
          onViewMode={setViewMode}
          showWireframe={showWireframe}
          onToggleWireframe={() => setShowWireframe((w) => !w)}
          selectedFaceId={selectedFaceId}
          onSelectFace={setSelectedFaceId}
          onPickFace2D={handlePickFace2D}
          selectedPart={selectedPart}
          onSelectMeshPart={handleSelectMeshPart}
          selectedArtworkId={selectedArtworkId}
          onSelectArtwork={setSelectedArtworkId}
          onUpdateArtwork={updateArtwork}
          onToggleParam={(key) => updateParam(key, !params[key])}
        />
        {kerfTest ? (
          <KerfTestPanel
            values={kerfValues}
            picked={kerfPicked}
            onPick={(v) => setKerfTest((prev) => (prev ? { ...prev, picked: v } : prev))}
            onShift={(dir) => setKerfTest((prev) => (prev ? { shift: prev.shift + dir, picked: null } : prev))}
            onDownloadSvg={() => handleDownloadSvg('all')}
            onUse={() => closeKerfTest('used')}
            onSkip={() => closeKerfTest('skipped')}
            sectionProps={{ ...sectionProps, handlers: { ...sectionHandlers, openKerfTest: undefined } }}
          />
        ) : (
        <Inspector
          templateId={params.templateId}
          category={params.category}
          onSelectTemplate={handleSelectTemplate}
          settingQuery={settingQuery}
          onSettingQuery={setSettingQuery}
          parts={parts}
          visibleParts={visibleParts}
          selectedPart={selectedPart}
          onSelectPart={handleSelectPart}
          onTogglePart={handleTogglePart}
          scrollRequest={scrollRequest}
          sectionProps={sectionProps}
        />
        )}
      </div>
    </div>
  );
};
