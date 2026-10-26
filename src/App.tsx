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
import { Stage, type ViewMode } from './ui/Stage';
import { withPrintedPinClamp } from './ui/paramRules';

export const App: React.FC = () => {
  const [params, setParams] = useState<BoxParameters>(DEFAULT_BOX_PARAMETERS);
  const [artworks, setArtworks] = useState<FaceArtwork[]>([]);
  const [selectedFaceId, setSelectedFaceId] = useState<string>('top');
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>('mm');
  const [assemblyProgress, setAssemblyProgress] = useState<number>(1.0);
  const [isPlayingAnim, setIsPlayingAnim] = useState<boolean>(false);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [settingQuery, setSettingQuery] = useState<string>('');
  /** The one open inspector section; null when the user closed it. */
  const [selectedPart, setSelectedPart] = useState<PartId | null>('size');
  /** Asks the inspector to scroll a part's chip and section into view; `n` makes a repeat count. */
  const [scrollRequest, setScrollRequest] = useState<{ id: PartId; n: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const animDirRef = useRef<number>(1);

  const model = useMemo(() => generateBoxModel(params), [params]);

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
    const part = partForMesh(meshPartId, params.templateId);
    if (!part) return;
    if (part === 'artwork') setSelectedFaceId(meshPartId);
    pickPart(part, '3d');
  };

  /** A face or an artwork picked in 2D becomes the artwork target app-wide: Artwork opens and 3D highlights it. */
  const handlePickFace2D = (faceId: string) => {
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

  // Auto-play fold / assemble animation loop
  useEffect(() => {
    if (!isPlayingAnim) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setAssemblyProgress((prev) => {
        let next = prev + animDirRef.current * dt * 0.42;
        if (next >= 1) {
          next = 1;
          animDirRef.current = -1;
        } else if (next <= 0) {
          next = 0;
          animDirRef.current = 1;
        }
        return Number(next.toFixed(3));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlayingAnim]);

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

  const slugBase = `boxer-${params.templateId}-${Math.round(model.innerDims.widthMm)}x${Math.round(model.innerDims.depthMm)}x${Math.round(model.innerDims.heightMm)}mm`;

  const handleDownloadSvg = (layerFilter: 'all' | 'score-only' | 'cut-only' = 'all') => {
    const svg = exportBoxSvg(model, artworks, layerFilter);
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
      new Blob([exportXcsProject(model)], { type: 'application/json' }),
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
      const pdfBytes = await exportBoxPdf(model, artworks);
      triggerDownload(
        new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
        `${slugBase}-${params.exportProfile}.pdf`
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadDxf = () => {
    const dxf = exportBoxDxf(model);
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
  };

  return (
    <div className="app">
      <AppBar
        category={params.category}
        onSelectCategory={handleSelectCategory}
        displayUnit={displayUnit}
        onSelectUnit={setDisplayUnit}
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
      <div className="app-body">
        <Stage
          model={model}
          params={params}
          artworks={artworks}
          displayUnit={displayUnit}
          viewMode={viewMode}
          onViewMode={setViewMode}
          assemblyProgress={assemblyProgress}
          onScrub={(progress) => {
            setIsPlayingAnim(false);
            setAssemblyProgress(progress);
          }}
          isPlaying={isPlayingAnim}
          onTogglePlay={() => setIsPlayingAnim((p) => !p)}
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
          sectionProps={{ params, updateParam, displayUnit, model, handlers: sectionHandlers }}
        />
      </div>
    </div>
  );
};
