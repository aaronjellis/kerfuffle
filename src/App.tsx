import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Download,
  FileCode,
  FileText,
  FolderKanban,
  Layers,
  Maximize2,
  Pause,
  Play,
  Printer,
  Scissors,
  Search,
  X,
} from 'lucide-react';
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
  EXPORT_PROFILES,
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
import { Viewport3D } from './components/Viewport3D';
import { Viewport2D } from './components/Viewport2D';
import { partsForTemplate, reconcileSelection, type PartId } from './ui/parts';
import { Section } from './ui/Section';
import { SECTION_COMPONENTS, type SectionHandlers } from './ui/sections';

export const App: React.FC = () => {
  const [params, setParams] = useState<BoxParameters>(DEFAULT_BOX_PARAMETERS);
  const [artworks, setArtworks] = useState<FaceArtwork[]>([]);
  const [selectedFaceId, setSelectedFaceId] = useState<string>('top');
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'split' | '3d' | '2d'>('split');
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>('mm');
  const [assemblyProgress, setAssemblyProgress] = useState<number>(1.0);
  const [isPlayingAnim, setIsPlayingAnim] = useState<boolean>(false);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [showCatalogModal, setShowCatalogModal] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [settingQuery, setSettingQuery] = useState<string>('');
  /** The one open inspector section; null when the user closed it. */
  const [selectedPart, setSelectedPart] = useState<PartId | null>('size');

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

  // Switch category & pick first template in that category
  const handleSelectCategory = (cat: BoxCategory) => {
    const firstTemplate =
      BOX_TEMPLATES.find((t) => t.category === cat)?.id || 'finger-basic';
    const matchingMaterial = MATERIAL_PRESETS.find((m) => m.category === cat);
    setParams((prev) => ({
      ...prev,
      category: cat,
      templateId: firstTemplate,
      materialThicknessMm: matchingMaterial
        ? matchingMaterial.thicknessMm
        : prev.materialThicknessMm,
      kerfMm: matchingMaterial ? matchingMaterial.kerfMm : prev.kerfMm,
      // A preset picked for another category no longer applies.
      materialPresetId: undefined,
    }));
  };

  const handleSelectTemplate = (templateId: BoxTemplateId) => {
    const meta = BOX_TEMPLATES.find((t) => t.id === templateId);
    if (!meta) return;
    const matchingMaterial = MATERIAL_PRESETS.find(
      (m) => m.category === meta.category
    );
    setParams((prev) => ({
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
    }));
    setShowCatalogModal(false);
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

  const activeTemplateMeta =
    BOX_TEMPLATES.find((t) => t.id === params.templateId) || BOX_TEMPLATES[0];
  const categoryTemplates = BOX_TEMPLATES.filter(
    (t) => t.category === params.category
  );
  const activeProfile = EXPORT_PROFILES[params.exportProfile];

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
    <div className="boxer-studio">
      {/* TOP BAR */}
      <header className="studio-topbar">
        <div className="brand-cluster">
          <div className="brand-icon">
            <Box size={18} />
          </div>
          <div>
            <div className="brand-title-row">
              <span className="brand-title">Boxer</span>
              <span className="brand-badge">1:1 Parametric Studio</span>
            </div>
            <p className="brand-subtitle">
              Laser Cut, Score-and-Fold Cardboard &amp; 3D Print Box Generator
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <nav className="mode-tabs" aria-label="Box fabrication mode">
          <button
            type="button"
            className={`mode-tab ${params.category === 'wood-finger' ? 'active' : ''}`}
            onClick={() => handleSelectCategory('wood-finger')}
          >
            <Scissors size={14} />
            Wood / MDF Joinery
          </button>
          <button
            type="button"
            className={`mode-tab ${params.category === 'cardboard-fold' ? 'active' : ''}`}
            onClick={() => handleSelectCategory('cardboard-fold')}
          >
            <Layers size={14} />
            Folding Cardboard
          </button>
          <button
            type="button"
            className={`mode-tab ${params.category === '3d-print' ? 'active' : ''}`}
            onClick={() => handleSelectCategory('3d-print')}
          >
            <Printer size={14} />
            3D Print Utility
          </button>
          <button
            type="button"
            className="catalog-btn"
            onClick={() => setShowCatalogModal(true)}
          >
            <FolderKanban size={14} />
            All 8 Templates
          </button>
        </nav>

        {/* Export Cluster */}
        <div className="export-cluster">
          <div className="segmented-toggle" title="Toggle display & input units between Millimeters (mm) and Inches (in)">
            <button
              type="button"
              className={displayUnit === 'mm' ? 'active' : ''}
              onClick={() => setDisplayUnit('mm')}
            >
              mm
            </button>
            <button
              type="button"
              className={displayUnit === 'in' ? 'active' : ''}
              onClick={() => setDisplayUnit('in')}
            >
              in
            </button>
          </div>

          <label className="profile-select-wrap" title={activeProfile.notes}>
            <span className="profile-label">Target Tool</span>
            <select
              value={params.exportProfile}
              onChange={(e) => handleSelectProfile(e.target.value as ExportProfileId)}
              className="profile-select"
            >
              {Object.values(EXPORT_PROFILES).map((prof) => (
                <option key={prof.id} value={prof.id}>
                  {prof.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="export-btn export-btn-primary"
            onClick={() => handleDownloadSvg('all')}
            title="Download 1:1 millimeter layered SVG (Cut, Score, and Print Artwork layers)"
          >
            <Download size={14} />
            SVG
          </button>
          <button
            type="button"
            className="export-btn"
            onClick={handleDownloadSplitSvg}
            title="Download separate Cut.svg and Score.svg files for easy 1-click import into xTool Studio"
          >
            <Scissors size={14} />
            Split (Cut+Score)
          </button>
          {showXcsExport && (
            <button
              type="button"
              className="export-btn"
              onClick={handleDownloadXcs}
              title="Download an xTool Studio project with cut and score settings assigned (beta)"
            >
              <FileCode size={14} />
              xTool project (.xcs) · beta
            </button>
          )}
          <button
            type="button"
            className="export-btn export-btn-accent"
            onClick={handleDownloadPdf}
            disabled={isExportingPdf}
            title="Download 1:1 physical scale PDF for xTool M2 Print-then-Cut or Adobe Illustrator"
          >
            <FileText size={14} />
            {isExportingPdf ? 'Building...' : 'PDF (Print+Cut)'}
          </button>
          <button
            type="button"
            className="export-btn"
            onClick={handleDownloadDxf}
            title="Download AutoCAD R14 DXF in millimeter units for LightBurn / CAD"
          >
            <FileCode size={14} />
            DXF
          </button>
          {params.category === '3d-print' && (
            <button
              type="button"
              className="export-btn export-btn-3d"
              onClick={handleDownloadStl}
              title="Download watertight 3D Printable STL mesh (Base + Lid)"
            >
              <Printer size={14} />
              Export STL
            </button>
          )}
          {params.category === '3d-print' && (
            <button
              type="button"
              className="export-btn export-btn-3d"
              onClick={handleDownloadStlParts}
              title="Download the base and the lid as two separate STL files"
            >
              <Printer size={14} />
              STL (two files)
            </button>
          )}
          {params.templateId === 'finger-clamshell' &&
            params.clamshellHingeType === 'printed-hinge' && (
              <button
                type="button"
                className="export-btn export-btn-3d"
                onClick={handleDownloadHingeStl}
                title="Print two of these"
              >
                <Printer size={14} />
                Export hinge STL
              </button>
            )}
        </div>
      </header>

      {/* MAIN 3-COLUMN WORKSPACE */}
      <div className="studio-body">
        {/* LEFT SIDEBAR: PARAMETRIC CONTROLS */}
        <aside className="sidebar sidebar-left">
          {/* Quick-Find Search & Section Filter Bar */}
          <div className="inspector-nav-card">
            <div className="inspector-search-box">
              <Search size={13} className="search-icon" />
              <input
                type="text"
                placeholder="Find setting (kerf, label, hinge, tab, fillet)..."
                value={settingQuery}
                onChange={(e) => setSettingQuery(e.target.value)}
              />
              {settingQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSettingQuery('')}
                  title="Clear filter"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Template picker (Task 4 moves it into the inspector header) */}
          <section className="panel-card">
            <div className="section-header">
              <span className="section-title">Template</span>
              <span className="pass-pill">{activeTemplateMeta.pass}</span>
            </div>
            <div className="template-pills">
              {categoryTemplates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  className={`template-pill ${params.templateId === tmpl.id ? 'active' : ''}`}
                  onClick={() => handleSelectTemplate(tmpl.id)}
                >
                  {tmpl.shortName}
                </button>
              ))}
            </div>
            <p className="helper-note">{activeTemplateMeta.tagline}</p>
          </section>

          {/* One collapsible section per part; a search opens every matching part */}
          <div className="inspect-parts">
            {visibleParts.map((part) => {
              const Body = SECTION_COMPONENTS[part.id];
              return (
                <Section
                  key={part.id}
                  id={part.id}
                  title={part.label}
                  icon={part.icon}
                  open={query ? true : selectedPart === part.id}
                  onToggle={handleTogglePart}
                >
                  <Body
                    params={params}
                    updateParam={updateParam}
                    displayUnit={displayUnit}
                    model={model}
                    handlers={sectionHandlers}
                  />
                </Section>
              );
            })}
            {visibleParts.length === 0 && (
              <p className="helper-note">No setting matches “{settingQuery.trim()}”.</p>
            )}
          </div>
        </aside>

        {/* CENTER VIEWPORT AREA */}
        <main className="center-stage">
          {/* Viewport Mode & Fold/Assemble Animation Bar */}
          <div className="stage-toolbar">
            <div className="view-mode-switcher">
              <button
                type="button"
                className={viewMode === 'split' ? 'active' : ''}
                onClick={() => setViewMode('split')}
              >
                <Maximize2 size={13} />
                Split (3D + 2D)
              </button>
              <button
                type="button"
                className={viewMode === '3d' ? 'active' : ''}
                onClick={() => setViewMode('3d')}
              >
                3D Preview
              </button>
              <button
                type="button"
                className={viewMode === '2d' ? 'active' : ''}
                onClick={() => setViewMode('2d')}
              >
                2D Cut Sheet
              </button>
            </div>

            {/* Interactive Fold / Explode Slider */}
            <div className="fold-scrubber">
              <button
                type="button"
                className={`play-btn ${isPlayingAnim ? 'playing' : ''}`}
                onClick={() => setIsPlayingAnim((p) => !p)}
                title={isPlayingAnim ? 'Pause fold/assembly animation' : 'Animate fold/assembly'}
              >
                {isPlayingAnim ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <span className="scrub-label">
                {params.category === 'cardboard-fold' ? 'Unfolded' : 'Exploded'}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={assemblyProgress}
                onChange={(e) => {
                  setIsPlayingAnim(false);
                  setAssemblyProgress(Number(e.target.value));
                }}
              />
              <span className="scrub-label">Closed ({Math.round(assemblyProgress * 100)}%)</span>
            </div>

            <div className="stage-stats">
              <span>Cut: {(model.stats.totalCutLengthMm / 1000).toFixed(2)}m</span>
              {model.stats.totalScoreLengthMm > 0 && (
                <span>Score: {(model.stats.totalScoreLengthMm / 1000).toFixed(2)}m</span>
              )}
              <button
                type="button"
                className={`wire-btn ${showWireframe ? 'active' : ''}`}
                onClick={() => setShowWireframe((w) => !w)}
              >
                Wireframe
              </button>
            </div>
          </div>

          <div className={`viewports-grid mode-${viewMode}`}>
            {(viewMode === 'split' || viewMode === '3d') && (
              <div className="viewport-pane">
                <div className="pane-badge">
                  3D Interactive Assembly — Click any face to select, drag to orbit
                </div>
                <Viewport3D
                  model={model}
                  artworks={artworks}
                  assemblyProgress={assemblyProgress}
                  selectedFaceId={selectedFaceId}
                  onSelectFace={setSelectedFaceId}
                  showWireframe={showWireframe}
                />
              </div>
            )}

            {(viewMode === 'split' || viewMode === '2d') && (
              <div className="viewport-pane">
                <Viewport2D
                  model={model}
                  artworks={artworks}
                  selectedFaceId={selectedFaceId}
                  selectedArtworkId={selectedArtworkId}
                  displayUnit={displayUnit}
                  onSelectFace={setSelectedFaceId}
                  onSelectArtwork={setSelectedArtworkId}
                  onUpdateArtwork={updateArtwork}
                  onToggleParam={(key) => updateParam(key, !params[key])}
                />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* TEMPLATE CATALOG & MULTI-PASS ROADMAP MODAL */}
      {showCatalogModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowCatalogModal(false)}
        >
          <div
            className="catalog-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>Boxer Parametric Template Catalog</h2>
                <p>
                  Select any box architecture below to load its parametric generator into the
                  studio.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCatalogModal(false)}
              >
                Close
              </button>
            </div>

            <div className="catalog-grid">
              {BOX_TEMPLATES.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className={`catalog-card ${params.templateId === tmpl.id ? 'active' : ''}`}
                  onClick={() => handleSelectTemplate(tmpl.id)}
                >
                  <div className="catalog-card-top">
                    <span className="pass-pill">{tmpl.pass}</span>
                    <span className="cat-tag">{tmpl.category}</span>
                  </div>
                  <h3>{tmpl.name}</h3>
                  <p>{tmpl.description}</p>
                  <button type="button" className="use-template-btn">
                    {params.templateId === tmpl.id ? 'Active in Studio' : 'Load Template →'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
