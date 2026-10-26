import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Box,
  Copy,
  Download,
  FileCode,
  FileText,
  FolderKanban,
  ImagePlus,
  Layers,
  Maximize2,
  Pause,
  Play,
  Printer,
  RotateCcw,
  Scissors,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  BoxCategory,
  BoxParameters,
  BoxTemplateId,
  DisplayUnit,
  ExportProfileId,
  FaceArtwork,
  FaceLabelPosition,
  TextArtworkConfig,
} from './engine/types';
import {
  BOX_TEMPLATES,
  DEFAULT_BOX_PARAMETERS,
  DEFAULT_FACE_LABELS,
  EXPORT_PROFILES,
  MACHINE_BED_PRESETS,
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
} from './engine/exporters';
import {
  createSampleArtworkDataUrl,
  SAMPLE_ARTWORK_PRESETS,
  SampleArtworkPreset,
} from './engine/sampleArtworks';
import {
  computePieceAlignmentOffset,
  DEFAULT_TEXT_ARTWORK_CONFIG,
  GOOGLE_FONT_CATALOG,
  loadGoogleFont,
  preloadCuratedGoogleFonts,
  renderTextArtworkToDataUrl,
  resolvePieceDimensions,
} from './engine/googleFonts';
import { Viewport3D } from './components/Viewport3D';
import { Viewport2D } from './components/Viewport2D';
import { NumberField } from './components/NumberField';
import { fmt } from './engine/fingerJointEngine';

type InspectorTab = 'all' | 'sizing' | 'joinery' | 'labels' | 'sheet';

const FACE_OPTIONS = [
  { id: 'top', label: 'Lid / Top' },
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'bottom', label: 'Bottom' },
];

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
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('all');
  const [settingQuery, setSettingQuery] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const animDirRef = useRef<number>(1);

  const model = useMemo(() => generateBoxModel(params), [params]);

  const updateParam = <K extends keyof BoxParameters>(
    key: K,
    value: BoxParameters[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
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

  const matchesSection = (tab: InspectorTab, keywords: string): boolean => {
    const q = settingQuery.trim().toLowerCase();
    if (q) {
      return keywords.toLowerCase().includes(q);
    }
    return inspectorTab === 'all' || inspectorTab === tab;
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
  const selectedArtwork =
    artworks.find((a) => a.id === selectedArtworkId) ||
    artworks.find((a) => a.faceId === selectedFaceId) ||
    null;
  const activeProfile = EXPORT_PROFILES[params.exportProfile];

  const isInch = displayUnit === 'in';
  const uLabel = isInch ? 'in' : 'mm';
  const fmtDim = (mm: number, inDecimals = 2): string =>
    isInch ? (mm / 25.4).toFixed(inDecimals) : fmt(mm);

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
              onChange={(e) =>
                updateParam('exportProfile', e.target.value as ExportProfileId)
              }
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
            <div className="inspector-tabs" role="tablist" aria-label="Settings filter">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'sizing', label: 'Sizing' },
                  {
                    id: 'joinery',
                    label:
                      params.category === 'wood-finger'
                        ? 'Joinery'
                        : params.category === 'cardboard-fold'
                        ? 'Flaps & Score'
                        : 'Shell & Fit',
                  },
                  { id: 'labels', label: 'Side Labels' },
                ] as { id: InspectorTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`inspector-tab-btn ${inspectorTab === tab.id && !settingQuery ? 'active' : ''}`}
                  onClick={() => {
                    setSettingQuery('');
                    setInspectorTab(tab.id);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template Sub-Picker */}
          {matchesSection('sizing', 'template style box model architecture preset') && (
            <section className="panel-card">
              <div className="section-header">
                <span className="section-title">1. Box Template</span>
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
          )}

          {/* Dimensions Section */}
          {matchesSection(
            'sizing',
            'dimensions width depth height size inner outer mm in inches'
          ) && (
            <section className="panel-card">
              <div className="section-header">
                <span className="section-title">2. Dimensions ({uLabel})</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div className="segmented-toggle">
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
                  <div className="segmented-toggle">
                    <button
                      type="button"
                      className={params.dimensionReference === 'inner' ? 'active' : ''}
                      onClick={() => updateParam('dimensionReference', 'inner')}
                    >
                      Inner
                    </button>
                    <button
                      type="button"
                      className={params.dimensionReference === 'outer' ? 'active' : ''}
                      onClick={() => updateParam('dimensionReference', 'outer')}
                    >
                      Outer
                    </button>
                  </div>
                </div>
              </div>

              <div className="param-row">
                <div className="param-label-row">
                  <label>Width (W) [{uLabel}]</label>
                  <NumberField
                    valueMm={params.widthMm}
                    minMm={20}
                    maxMm={500}
                    step={isInch ? 0.1 : 1}
                    displayUnit={displayUnit}
                    inDecimals={2}
                    mmDecimals={1}
                    ariaLabel="Width"
                    onChangeMm={(mm) => updateParam('widthMm', mm)}
                  />
                </div>
                <input
                  type="range"
                  min={25}
                  max={320}
                  step={1}
                  value={params.widthMm}
                  onChange={(e) => updateParam('widthMm', Number(e.target.value))}
                />
              </div>

              <div className="param-row">
                <div className="param-label-row">
                  <label>Depth (D) [{uLabel}]</label>
                  <NumberField
                    valueMm={params.depthMm}
                    minMm={20}
                    maxMm={500}
                    step={isInch ? 0.1 : 1}
                    displayUnit={displayUnit}
                    inDecimals={2}
                    mmDecimals={1}
                    ariaLabel="Depth"
                    onChangeMm={(mm) => updateParam('depthMm', mm)}
                  />
                </div>
                <input
                  type="range"
                  min={25}
                  max={320}
                  step={1}
                  value={params.depthMm}
                  onChange={(e) => updateParam('depthMm', Number(e.target.value))}
                />
              </div>

              <div className="param-row">
                <div className="param-label-row">
                  <label>Height (H) [{uLabel}]</label>
                  <NumberField
                    valueMm={params.heightMm}
                    minMm={15}
                    maxMm={400}
                    step={isInch ? 0.1 : 1}
                    displayUnit={displayUnit}
                    inDecimals={2}
                    mmDecimals={1}
                    ariaLabel="Height"
                    onChangeMm={(mm) => updateParam('heightMm', mm)}
                  />
                </div>
                <input
                  type="range"
                  min={18}
                  max={240}
                  step={1}
                  value={params.heightMm}
                  onChange={(e) => updateParam('heightMm', Number(e.target.value))}
                />
              </div>

              <div className="dims-readout">
                <div>
                  <span>Inner:</span>
                  <strong>
                    {fmtDim(model.innerDims.widthMm)} × {fmtDim(model.innerDims.depthMm)} ×{' '}
                    {fmtDim(model.innerDims.heightMm)} {uLabel}
                  </strong>
                </div>
                <div>
                  <span>Outer:</span>
                  <strong>
                    {fmtDim(model.outerDims.widthMm)} × {fmtDim(model.outerDims.depthMm)} ×{' '}
                    {fmtDim(model.outerDims.heightMm)} {uLabel}
                  </strong>
                </div>
              </div>
            </section>
          )}

          {/* Material & Laser Kerf Section (for Laser modes) */}
          {params.category !== '3d-print' &&
            matchesSection(
              'sizing',
              'material preset thickness laser kerf wood mdf basswood cardboard flute'
            ) && (
              <section className="panel-card">
                <div className="section-header">
                  <span className="section-title">3. Material &amp; Laser Kerf</span>
                </div>

                <label className="field-block">
                  <span>Material Preset</span>
                  <select
                    value=""
                    onChange={(e) => {
                      const mat = MATERIAL_PRESETS.find((m) => m.id === e.target.value);
                      if (mat) {
                        updateParam('materialThicknessMm', mat.thicknessMm);
                        updateParam('kerfMm', mat.kerfMm);
                      }
                    }}
                  >
                    <option value="" disabled>
                      Choose a stock preset...
                    </option>
                    {MATERIAL_PRESETS.filter((m) => m.category === params.category).map(
                      (mat) => (
                        <option key={mat.id} value={mat.id}>
                          {mat.name} (kerf {mat.kerfMm}mm)
                        </option>
                      )
                    )}
                  </select>
                </label>

                <div className="two-col-inputs">
                  <label className="field-block">
                    <span>Thickness ({uLabel})</span>
                    <NumberField
                      valueMm={params.materialThicknessMm}
                      minMm={0.2}
                      maxMm={15}
                      step={isInch ? 0.005 : 0.1}
                      displayUnit={displayUnit}
                      inDecimals={3}
                      mmDecimals={2}
                      ariaLabel="Material Thickness"
                      onChangeMm={(mm) => updateParam('materialThicknessMm', mm)}
                    />
                  </label>
                  <label className="field-block">
                    <span>Laser Kerf ({uLabel})</span>
                    <NumberField
                      valueMm={params.kerfMm}
                      minMm={0}
                      maxMm={1.0}
                      step={isInch ? 0.001 : 0.02}
                      displayUnit={displayUnit}
                      inDecimals={4}
                      mmDecimals={2}
                      ariaLabel="Laser Kerf"
                      onChangeMm={(mm) => updateParam('kerfMm', mm)}
                    />
                  </label>
                </div>
              </section>
            )}

          {/* WOOD / MDF JOINERY SPECIFIC SETTINGS */}
          {params.category === 'wood-finger' &&
            matchesSection(
              'joinery',
              'finger joint width lid style clamshell hinge seam screw holes living hinge pitch wall attach divider columns rows'
            ) && (
              <section className="panel-card">
                <div className="section-header">
                  <span className="section-title">4. Finger Joints &amp; Hinges</span>
                </div>

                <div className="param-row">
                  <div className="param-label-row">
                    <label>Target Finger Size ({uLabel})</label>
                    <NumberField
                      valueMm={params.fingerWidthMm}
                      minMm={4}
                      maxMm={50}
                      step={isInch ? 0.05 : 1}
                      displayUnit={displayUnit}
                      inDecimals={2}
                      mmDecimals={1}
                      ariaLabel="Target Finger Size"
                      onChangeMm={(mm) => updateParam('fingerWidthMm', mm)}
                    />
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={35}
                    step={1}
                    value={params.fingerWidthMm}
                    onChange={(e) => updateParam('fingerWidthMm', Number(e.target.value))}
                  />
                </div>

                {params.templateId === 'finger-basic' && (
                  <label className="field-block">
                    <span>Top / Lid Construction</span>
                    <select
                      value={params.woodLidStyle}
                      onChange={(e) =>
                        updateParam('woodLidStyle', e.target.value as BoxParameters['woodLidStyle'])
                      }
                    >
                      <option value="flat-lid">Flat Lift-Off Lid</option>
                      <option value="inset-lid">Lift-Off Lid + Inner Retainer Lip</option>
                      <option value="closed">6-Sided Interlocking Finger Box</option>
                      <option value="open">Open-Top 5-Sided Tray</option>
                    </select>
                  </label>
                )}

                {params.templateId === 'finger-clamshell' && (
                  <>
                    <label className="field-block">
                      <span>Rear Hinge Seam Joinery</span>
                      <select
                        value={params.clamshellHingeType}
                        onChange={(e) =>
                          updateParam(
                            'clamshellHingeType',
                            e.target.value as BoxParameters['clamshellHingeType']
                          )
                        }
                      >
                        <option value="butt-hardware">
                          Flat Butt Seam (No Fingers — Add Hardware Hinge)
                        </option>
                        <option value="side-pivot">
                          Flat Rear Seam + Side-Wall Pivot Pin Holes
                        </option>
                        <option value="knuckle-pin">
                          Interlocking Finger Seam (Custom Hinge Fingers)
                        </option>
                        <option value="printed-hinge">Printed hinge (STL)</option>
                      </select>
                    </label>
                    <div className="two-col-inputs">
                      <label className="field-block">
                        <span>Lid Height ({uLabel})</span>
                        <NumberField
                          valueMm={params.lidHeightMm}
                          minMm={12}
                          maxMm={Math.max(12, params.heightMm - 12)}
                          step={isInch ? 0.05 : 1}
                          displayUnit={displayUnit}
                          inDecimals={2}
                          mmDecimals={1}
                          ariaLabel="Lid Height"
                          onChangeMm={(mm) => updateParam('lidHeightMm', mm)}
                        />
                      </label>
                      {params.clamshellHingeType === 'knuckle-pin' ? (
                        <label className="field-block">
                          <span>Hinge Finger ({uLabel})</span>
                          <NumberField
                            valueMm={params.hingeFingerWidthMm}
                            minMm={4}
                            maxMm={40}
                            step={isInch ? 0.05 : 1}
                            displayUnit={displayUnit}
                            inDecimals={2}
                            mmDecimals={1}
                            ariaLabel="Hinge Finger Width"
                            onChangeMm={(mm) => updateParam('hingeFingerWidthMm', mm)}
                          />
                        </label>
                      ) : (
                        <label className="field-block">
                          <span>
                            {params.clamshellHingeType === 'printed-hinge' ? 'Pin Ø' : 'Hole Ø'} (
                            {uLabel})
                          </span>
                          <NumberField
                            valueMm={params.hingePinDiameterMm}
                            minMm={1.0}
                            maxMm={6.0}
                            step={isInch ? 0.01 : 0.2}
                            displayUnit={displayUnit}
                            inDecimals={3}
                            mmDecimals={2}
                            ariaLabel="Hinge Hole Diameter"
                            onChangeMm={(mm) => updateParam('hingePinDiameterMm', mm)}
                          />
                        </label>
                      )}
                    </div>
                    {params.clamshellHingeType === 'butt-hardware' && (
                      <div className="checkbox-row" style={{ marginTop: 2 }}>
                        <label>
                          <input
                            type="checkbox"
                            checked={params.includeHingeScrewHoles}
                            onChange={(e) =>
                              updateParam('includeHingeScrewHoles', e.target.checked)
                            }
                          />
                          Cut Pilot Screw Holes for Brass Butt Hinges
                        </label>
                      </div>
                    )}
                  </>
                )}

                {params.templateId === 'finger-living-hinge' && (
                  <>
                    <label className="field-block">
                      <span>Wall Attachment Mode</span>
                      <select
                        value={params.livingHingeAttachMode}
                        onChange={(e) =>
                          updateParam(
                            'livingHingeAttachMode',
                            e.target.value as BoxParameters['livingHingeAttachMode']
                          )
                        }
                      >
                        <option value="one-piece-back">
                          1-Piece Integrated Back Wall + Front Catch Slot
                        </option>
                        <option value="side-arch-tabs">
                          1-Piece Back Wall + Top-Deck Side Retainer Tabs
                        </option>
                        <option value="finger-joint-back">
                          2-Piece Finger-Jointed to Back Wall + Front Catch
                        </option>
                      </select>
                    </label>

                    <div className="param-row">
                      <div className="param-label-row">
                        <label>Living Hinge Kerf Pitch ({uLabel})</label>
                        <NumberField
                          valueMm={params.livingHingePitchMm}
                          minMm={1.8}
                          maxMm={6.0}
                          step={isInch ? 0.01 : 0.2}
                          displayUnit={displayUnit}
                          inDecimals={3}
                          mmDecimals={2}
                          ariaLabel="Living Hinge Pitch"
                          onChangeMm={(mm) => updateParam('livingHingePitchMm', mm)}
                        />
                      </div>
                      <input
                        type="range"
                        min={1.8}
                        max={5.0}
                        step={0.1}
                        value={params.livingHingePitchMm}
                        onChange={(e) => updateParam('livingHingePitchMm', Number(e.target.value))}
                      />
                    </div>
                  </>
                )}

                {params.templateId === 'finger-organizer' && (
                  <div className="two-col-inputs">
                    <label className="field-block">
                      <span>Columns (X)</span>
                      <NumberField
                        valueMm={params.dividerCols}
                        minMm={1}
                        maxMm={6}
                        step={1}
                        isRawCount
                        ariaLabel="Divider Columns"
                        onChangeMm={(n) => updateParam('dividerCols', n)}
                      />
                    </label>
                    <label className="field-block">
                      <span>Rows (Y)</span>
                      <NumberField
                        valueMm={params.dividerRows}
                        minMm={1}
                        maxMm={6}
                        step={1}
                        isRawCount
                        ariaLabel="Divider Rows"
                        onChangeMm={(n) => updateParam('dividerRows', n)}
                      />
                    </label>
                  </div>
                )}

                <p className="helper-note">{model.stats.fingerCountSummary}</p>
              </section>
            )}

          {/* CARDBOARD FOLDING SPECIFIC SETTINGS */}
          {params.category === 'cardboard-fold' &&
            matchesSection(
              'joinery',
              'score line mode perforation perf cut bridge lock tab width depth tuck flap glue flap clearance thumb notch reverse straight'
            ) && (
              <section className="panel-card">
                <div className="section-header">
                  <span className="section-title">4. Score Lines, Flaps &amp; Locks</span>
                </div>

                {params.templateId === 'cardboard-mailer' && (
                  <>
                    <label className="field-block">
                      <span>Lid Locking Mechanism</span>
                      <select
                        value={params.cardboardLockStyle}
                        onChange={(e) =>
                          updateParam(
                            'cardboardLockStyle',
                            e.target.value as BoxParameters['cardboardLockStyle']
                          )
                        }
                      >
                        <option value="tuck">Tuck top</option>
                        <option value="front-lock">Front lock tabs</option>
                      </select>
                    </label>

                    {params.cardboardLockStyle === 'front-lock' && (
                      <div className="two-col-inputs">
                        <label className="field-block">
                          <span>Lock Tab Width ({uLabel})</span>
                          <NumberField
                            valueMm={params.lockTabWidthMm}
                            minMm={8}
                            maxMm={60}
                            step={isInch ? 0.05 : 1}
                            displayUnit={displayUnit}
                            inDecimals={2}
                            mmDecimals={1}
                            ariaLabel="Lock Tab Width"
                            onChangeMm={(mm) => updateParam('lockTabWidthMm', mm)}
                          />
                        </label>
                        <label className="field-block">
                          <span>Lock Tab Depth ({uLabel})</span>
                          <NumberField
                            valueMm={params.lockTabDepthMm}
                            minMm={5}
                            maxMm={45}
                            step={isInch ? 0.05 : 1}
                            displayUnit={displayUnit}
                            inDecimals={2}
                            mmDecimals={1}
                            ariaLabel="Lock Tab Depth"
                            onChangeMm={(mm) => updateParam('lockTabDepthMm', mm)}
                          />
                        </label>
                      </div>
                    )}

                    <div className="checkbox-row" style={{ marginTop: 2 }}>
                      <label>
                        <input
                          type="checkbox"
                          checked={params.includeLidFlaps}
                          onChange={(e) => updateParam('includeLidFlaps', e.target.checked)}
                        />
                        Lid side flaps
                      </label>
                    </div>
                  </>
                )}

                <label className="field-block">
                  <span>Fold / Score Line Mode</span>
                  <select
                    value={params.scoreLineMode}
                    onChange={(e) =>
                      updateParam(
                        'scoreLineMode',
                        e.target.value as BoxParameters['scoreLineMode']
                      )
                    }
                  >
                    <option value="solid-score">Continuous Vector Score (Laser Partial Depth)</option>
                    <option value="dashed-perf">Perforated Cut / Bridge (Corrugated Fold)</option>
                  </select>
                </label>

                {params.scoreLineMode === 'dashed-perf' && (
                  <div className="two-col-inputs">
                    <label className="field-block">
                      <span>Perf Cut ({uLabel})</span>
                      <NumberField
                        valueMm={params.perfCutMm}
                        minMm={1}
                        maxMm={15}
                        step={isInch ? 0.02 : 0.5}
                        displayUnit={displayUnit}
                        inDecimals={3}
                        mmDecimals={2}
                        ariaLabel="Perforation Cut Length"
                        onChangeMm={(mm) => updateParam('perfCutMm', mm)}
                      />
                    </label>
                    <label className="field-block">
                      <span>Perf Bridge ({uLabel})</span>
                      <NumberField
                        valueMm={params.perfGapMm}
                        minMm={0.8}
                        maxMm={10}
                        step={isInch ? 0.01 : 0.2}
                        displayUnit={displayUnit}
                        inDecimals={3}
                        mmDecimals={2}
                        ariaLabel="Perforation Bridge Length"
                        onChangeMm={(mm) => updateParam('perfGapMm', mm)}
                      />
                    </label>
                  </div>
                )}

                {params.templateId !== 'cardboard-telescope' && (
                  <div className="two-col-inputs">
                    <label className="field-block">
                      <span>Tuck Flap ({uLabel})</span>
                      <NumberField
                        valueMm={params.tuckFlapMm}
                        minMm={10}
                        maxMm={45}
                        step={isInch ? 0.05 : 1}
                        displayUnit={displayUnit}
                        inDecimals={2}
                        mmDecimals={1}
                        ariaLabel="Tuck Flap Length"
                        onChangeMm={(mm) => updateParam('tuckFlapMm', mm)}
                      />
                    </label>
                    {params.templateId === 'cardboard-tuck-carton' && (
                      <label className="field-block">
                        <span>Glue Flap ({uLabel})</span>
                        <NumberField
                          valueMm={params.glueFlapMm}
                          minMm={8}
                          maxMm={35}
                          step={isInch ? 0.05 : 1}
                          displayUnit={displayUnit}
                          inDecimals={2}
                          mmDecimals={1}
                          ariaLabel="Glue Flap Width"
                          onChangeMm={(mm) => updateParam('glueFlapMm', mm)}
                        />
                      </label>
                    )}
                  </div>
                )}

                {params.templateId === 'cardboard-tuck-carton' && (
                  <label className="field-block">
                    <span>Carton Closure Orientation</span>
                    <select
                      value={params.tuckCartonStyle}
                      onChange={(e) =>
                        updateParam(
                          'tuckCartonStyle',
                          e.target.value as BoxParameters['tuckCartonStyle']
                        )
                      }
                    >
                      <option value="reverse-tuck">Reverse Tuck End (RTE)</option>
                      <option value="straight-tuck">Straight Tuck End (STE)</option>
                    </select>
                  </label>
                )}

                {params.templateId === 'cardboard-telescope' && (
                  <div className="two-col-inputs">
                    <label className="field-block">
                      <span>Lid Height ({uLabel})</span>
                      <NumberField
                        valueMm={params.lidHeightMm}
                        minMm={15}
                        maxMm={params.heightMm}
                        step={isInch ? 0.05 : 1}
                        displayUnit={displayUnit}
                        inDecimals={2}
                        mmDecimals={1}
                        ariaLabel="Lid Height"
                        onChangeMm={(mm) => updateParam('lidHeightMm', mm)}
                      />
                    </label>
                    <label className="field-block">
                      <span>Slip Clearance ({uLabel})</span>
                      <NumberField
                        valueMm={params.telescopeClearanceMm}
                        minMm={0.4}
                        maxMm={4.0}
                        step={isInch ? 0.01 : 0.2}
                        displayUnit={displayUnit}
                        inDecimals={3}
                        mmDecimals={2}
                        ariaLabel="Telescope Clearance"
                        onChangeMm={(mm) => updateParam('telescopeClearanceMm', mm)}
                      />
                    </label>
                  </div>
                )}
              </section>
            )}

          {/* 3D PRINT SPECIFIC SETTINGS */}
          {params.category === '3d-print' &&
            matchesSection(
              'joinery',
              'wall floor thickness inner outer fillet chamfer lid split height snap clasp latch knuckle hinge'
            ) && (
              <section className="panel-card">
                <div className="section-header">
                  <span className="section-title">3. 3D Print Shell, Fillets &amp; Clasps</span>
                </div>

                <div className="two-col-inputs">
                  <label className="field-block">
                    <span>Wall Thickness ({uLabel})</span>
                    <NumberField
                      valueMm={params.wallThickness3dMm}
                      minMm={1.2}
                      maxMm={8.0}
                      step={isInch ? 0.01 : 0.4}
                      displayUnit={displayUnit}
                      inDecimals={3}
                      mmDecimals={2}
                      ariaLabel="Wall Thickness"
                      onChangeMm={(mm) => updateParam('wallThickness3dMm', mm)}
                    />
                  </label>
                  <label className="field-block">
                    <span>Floor / Lid ({uLabel})</span>
                    <NumberField
                      valueMm={params.floorThickness3dMm}
                      minMm={1.2}
                      maxMm={6.0}
                      step={isInch ? 0.01 : 0.2}
                      displayUnit={displayUnit}
                      inDecimals={3}
                      mmDecimals={2}
                      ariaLabel="Floor Thickness"
                      onChangeMm={(mm) => updateParam('floorThickness3dMm', mm)}
                    />
                  </label>
                </div>

                <div className="two-col-inputs">
                  <label className="field-block">
                    <span>Inner Fillet ({uLabel})</span>
                    <NumberField
                      valueMm={params.innerFilletMm}
                      minMm={0}
                      maxMm={25}
                      step={isInch ? 0.02 : 0.5}
                      displayUnit={displayUnit}
                      inDecimals={2}
                      mmDecimals={1}
                      ariaLabel="Inner Fillet"
                      onChangeMm={(mm) => updateParam('innerFilletMm', mm)}
                    />
                  </label>
                  <label className="field-block">
                    <span>Outer Fillet ({uLabel})</span>
                    <NumberField
                      valueMm={params.outerFilletMm}
                      minMm={0}
                      maxMm={25}
                      step={isInch ? 0.02 : 0.5}
                      displayUnit={displayUnit}
                      inDecimals={2}
                      mmDecimals={1}
                      ariaLabel="Outer Fillet"
                      onChangeMm={(mm) => updateParam('outerFilletMm', mm)}
                    />
                  </label>
                </div>

                <div className="two-col-inputs">
                  <label className="field-block">
                    <span>45° Bed Chamfer ({uLabel})</span>
                    <NumberField
                      valueMm={params.outerChamferMm}
                      minMm={0}
                      maxMm={4.0}
                      step={isInch ? 0.01 : 0.2}
                      displayUnit={displayUnit}
                      inDecimals={3}
                      mmDecimals={2}
                      ariaLabel="Bed Chamfer"
                      onChangeMm={(mm) => updateParam('outerChamferMm', mm)}
                    />
                  </label>
                  <label className="field-block">
                    <span>Lid Split Height ({uLabel})</span>
                    <NumberField
                      valueMm={params.lidHeightMm}
                      minMm={10}
                      maxMm={Math.max(10, params.heightMm - 10)}
                      step={isInch ? 0.05 : 1}
                      displayUnit={displayUnit}
                      inDecimals={2}
                      mmDecimals={1}
                      ariaLabel="Lid Split Height"
                      onChangeMm={(mm) => updateParam('lidHeightMm', mm)}
                    />
                  </label>
                </div>

                <div className="checkbox-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={params.includeSnapClasp}
                      onChange={(e) => updateParam('includeSnapClasp', e.target.checked)}
                    />
                    Front Snap-Fit Latch Clasp
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={params.include3dHinge}
                      onChange={(e) => updateParam('include3dHinge', e.target.checked)}
                    />
                    Rear Knuckle Hinge Lugs
                  </label>
                </div>
              </section>
            )}

          {/* INNER SIDE SCORE LABELS SECTION */}
          {matchesSection(
            'labels',
            'side labels inner name score text font mirror position top bottom front back left right'
          ) && (
            <section className="panel-card">
              <div className="section-header">
                <span className="section-title">
                  <Tag size={12} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                  5. Inner Side Labels (Laser Score)
                </span>
                <span className="pass-pill">Vector Score</span>
              </div>

              <p className="helper-note">
                Add single-stroke vector names to the inner side of each face on the{' '}
                <strong>Score Layer</strong> so parts are labeled after laser cutting.
              </p>

              <div className="checkbox-row">
                <label className="highlight-toggle">
                  <input
                    type="checkbox"
                    checked={params.scoreInnerFaceLabels}
                    onChange={(e) => updateParam('scoreInnerFaceLabels', e.target.checked)}
                  />
                  <strong>Score Side Names onto Inner Faces</strong>
                </label>
              </div>

              <div className="two-col-inputs">
                <label className="field-block">
                  <span>Label Position</span>
                  <select
                    value={params.faceLabelPosition}
                    onChange={(e) =>
                      updateParam('faceLabelPosition', e.target.value as FaceLabelPosition)
                    }
                  >
                    <option value="center">Center of Face</option>
                    <option value="bottom">Bottom Edge / Corner</option>
                    <option value="top-left">Top Edge</option>
                  </select>
                </label>
                <label className="field-block">
                  <span>Text Size ({uLabel})</span>
                  <NumberField
                    valueMm={params.faceLabelSizeMm}
                    minMm={2.0}
                    maxMm={20.0}
                    step={isInch ? 0.02 : 0.5}
                    displayUnit={displayUnit}
                    inDecimals={2}
                    mmDecimals={1}
                    ariaLabel="Label Text Size"
                    onChangeMm={(mm) => updateParam('faceLabelSizeMm', mm)}
                  />
                </label>
              </div>

              <div className="checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    checked={params.scoreFaceDimensions}
                    onChange={(e) => updateParam('scoreFaceDimensions', e.target.checked)}
                  />
                  Also Score Panel Dimensions Below Name
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={params.mirrorInnerFaceLabels}
                    onChange={(e) => updateParam('mirrorInnerFaceLabels', e.target.checked)}
                  />
                  Mirror / Flip Text Horizontally (Back-Side Cut)
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={params.showGuideLabels2D}
                    onChange={(e) => updateParam('showGuideLabels2D', e.target.checked)}
                  />
                  Show Screen-Only Guide Names in 2D Preview
                </label>
              </div>

              <div className="face-names-editor">
                <div className="param-label-row" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>
                    Custom Side Names (clear to skip a face)
                  </span>
                  <button
                    type="button"
                    className="text-action-btn"
                    onClick={() => updateParam('customFaceLabels', { ...DEFAULT_FACE_LABELS })}
                  >
                    <RotateCcw size={10} /> Reset
                  </button>
                </div>
                <div className="two-col-inputs">
                  {FACE_OPTIONS.map((f) => (
                    <label key={f.id} className="field-block">
                      <span>{f.label}</span>
                      <input
                        type="text"
                        className="text-field"
                        placeholder={`e.g. ${DEFAULT_FACE_LABELS[f.id]}`}
                        value={
                          params.customFaceLabels?.[f.id] ?? DEFAULT_FACE_LABELS[f.id] ?? ''
                        }
                        onChange={(e) => updateFaceLabel(f.id, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </section>
          )}
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

        {/* RIGHT SIDEBAR: FACE ARTWORK, GOOGLE FONT TEXT & LASER SHEET NESTING */}
        <aside className="sidebar sidebar-right">
          <section className="panel-card">
            <div className="section-header">
              <span className="section-title">Face Artwork &amp; Google Fonts</span>
              <span className="pass-pill">Print + Cut</span>
            </div>

            <p className="helper-note">
              Select a box piece to add <strong>Google Font text</strong> or <strong>SVG / PNG</strong>{' '}
              graphics, then align or snap them to any edge or center of the piece.
            </p>

            <div className="face-pills">
              {FACE_OPTIONS.map((f) => {
                const count = artworks.filter((a) => a.faceId === f.id).length;
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`face-pill ${selectedFaceId === f.id ? 'active' : ''}`}
                    onClick={() => setSelectedFaceId(f.id)}
                  >
                    {f.label}
                    {count > 0 && <span className="art-count">{count}</span>}
                  </button>
                );
              })}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".svg,.png,.jpg,.jpeg,.webp"
              style={{ display: 'none' }}
              onChange={handleUploadFile}
            />

            <div className="two-col-inputs">
              <button
                type="button"
                className="upload-art-btn add-text-btn"
                onClick={handleAddTextArtwork}
              >
                <Type size={15} />
                + Add Text (Font)
              </button>
              <button
                type="button"
                className="upload-art-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={15} />
                Upload SVG / PNG
              </button>
            </div>

            <div className="sample-stamps-block">
              <span className="mini-heading">
                <Sparkles size={12} /> Quick Sample Graphics
              </span>
              <div className="sample-stamp-btns">
                {SAMPLE_ARTWORK_PRESETS.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    className="sample-btn"
                    onClick={() => handleAddSampleStamp(sample)}
                  >
                    + {sample.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Layer Switcher when multiple items exist on this piece */}
            {artworks.filter((a) => a.faceId === selectedFaceId).length > 1 && (
              <div className="face-layer-list">
                <span className="mini-heading">
                  Items on {FACE_OPTIONS.find((f) => f.id === selectedFaceId)?.label}
                </span>
                <div className="layer-chips">
                  {artworks
                    .filter((a) => a.faceId === selectedFaceId)
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`layer-chip ${selectedArtwork?.id === item.id ? 'active' : ''}`}
                        onClick={() => setSelectedArtworkId(item.id)}
                      >
                        {item.textConfig ? <Type size={11} /> : <ImagePlus size={11} />}
                        <span>{item.name}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {selectedArtwork ? (
              <div className="artwork-inspector">
                <div className="art-inspector-header">
                  <strong>{selectedArtwork.name}</strong>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button
                      type="button"
                      className="icon-action-btn"
                      onClick={() => handleDuplicateArtwork(selectedArtwork)}
                      title="Duplicate this item"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-danger-btn"
                      onClick={() => removeArtwork(selectedArtwork.id)}
                      title="Remove item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="segmented-toggle" style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    className={selectedArtwork.mode === 'print' ? 'active' : ''}
                    onClick={() => {
                      if (selectedArtwork.textConfig) {
                        handleUpdateTextConfig(selectedArtwork, {}, 'print');
                      } else {
                        updateArtwork(selectedArtwork.id, { mode: 'print' });
                      }
                    }}
                  >
                    Inkjet Print (Color)
                  </button>
                  <button
                    type="button"
                    className={selectedArtwork.mode === 'engrave' ? 'active' : ''}
                    onClick={() => {
                      if (selectedArtwork.textConfig) {
                        handleUpdateTextConfig(selectedArtwork, {}, 'engrave');
                      } else {
                        updateArtwork(selectedArtwork.id, { mode: 'engrave' });
                      }
                    }}
                  >
                    Laser Engrave
                  </button>
                </div>

                {/* GOOGLE FONT TEXT INSPECTOR */}
                {selectedArtwork.textConfig && (
                  <div className="text-config-panel">
                    <label className="field-block">
                      <span>Text Content (multi-line supported)</span>
                      <textarea
                        rows={2}
                        className="text-area-field"
                        value={selectedArtwork.textConfig.text}
                        onChange={(e) =>
                          handleUpdateTextConfig(selectedArtwork, { text: e.target.value })
                        }
                        placeholder="Enter text..."
                      />
                    </label>

                    <label className="field-block">
                      <span>Google Font Family</span>
                      <select
                        value={
                          GOOGLE_FONT_CATALOG.some(
                            (f) => f.family === selectedArtwork.textConfig?.fontFamily
                          )
                            ? selectedArtwork.textConfig.fontFamily
                            : '__custom__'
                        }
                        style={{
                          fontFamily: `"${selectedArtwork.textConfig.fontFamily}", sans-serif`,
                        }}
                        onChange={(e) => {
                          if (e.target.value !== '__custom__') {
                            handleUpdateTextConfig(selectedArtwork, {
                              fontFamily: e.target.value,
                            });
                          }
                        }}
                      >
                        {(
                          [
                            'Sans-Serif',
                            'Serif',
                            'Display & Stencil',
                            'Script & Handwritten',
                            'Monospace',
                          ] as const
                        ).map((cat) => (
                          <optgroup key={cat} label={cat}>
                            {GOOGLE_FONT_CATALOG.filter((f) => f.category === cat).map((f) => (
                              <option
                                key={f.family}
                                value={f.family}
                                style={{ fontFamily: `"${f.family}", sans-serif` }}
                              >
                                {f.family} — {f.previewTag}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        {!GOOGLE_FONT_CATALOG.some(
                          (f) => f.family === selectedArtwork.textConfig?.fontFamily
                        ) && (
                          <option value="__custom__">
                            Custom: {selectedArtwork.textConfig.fontFamily}
                          </option>
                        )}
                      </select>
                    </label>

                    <div className="custom-font-row">
                      <input
                        type="text"
                        className="text-field"
                        placeholder="Or type any Google Font (e.g. Lobster, Orbitron)..."
                        value={customFontInput}
                        onChange={(e) => setCustomFontInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customFontInput.trim()) {
                            handleUpdateTextConfig(selectedArtwork, {
                              fontFamily: customFontInput.trim(),
                            });
                            setCustomFontInput('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="mini-action-btn"
                        disabled={!customFontInput.trim()}
                        onClick={() => {
                          if (customFontInput.trim()) {
                            handleUpdateTextConfig(selectedArtwork, {
                              fontFamily: customFontInput.trim(),
                            });
                            setCustomFontInput('');
                          }
                        }}
                      >
                        Load Font
                      </button>
                    </div>

                    <div className="two-col-inputs">
                      <label className="field-block">
                        <span>Weight &amp; Style</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <select
                            value={selectedArtwork.textConfig.fontWeight}
                            onChange={(e) =>
                              handleUpdateTextConfig(selectedArtwork, {
                                fontWeight: e.target.value as TextArtworkConfig['fontWeight'],
                              })
                            }
                          >
                            <option value="400">Regular (400)</option>
                            <option value="600">SemiBold (600)</option>
                            <option value="700">Bold (700)</option>
                            <option value="800">ExtraBold (800)</option>
                          </select>
                          <button
                            type="button"
                            className={`style-toggle-btn ${
                              selectedArtwork.textConfig.fontStyle === 'italic' ? 'active' : ''
                            }`}
                            onClick={() =>
                              handleUpdateTextConfig(selectedArtwork, {
                                fontStyle:
                                  selectedArtwork.textConfig?.fontStyle === 'italic'
                                    ? 'normal'
                                    : 'italic',
                              })
                            }
                            title="Toggle Italic"
                          >
                            <em>I</em>
                          </button>
                        </div>
                      </label>

                      <label className="field-block">
                        <span>Line Align &amp; Color</span>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <div className="segmented-toggle" style={{ flex: 1 }}>
                            <button
                              type="button"
                              className={
                                selectedArtwork.textConfig.textAlign === 'left' ? 'active' : ''
                              }
                              onClick={() =>
                                handleUpdateTextConfig(selectedArtwork, { textAlign: 'left' })
                              }
                              title="Align multi-line text left"
                            >
                              <AlignLeft size={12} />
                            </button>
                            <button
                              type="button"
                              className={
                                selectedArtwork.textConfig.textAlign === 'center' ? 'active' : ''
                              }
                              onClick={() =>
                                handleUpdateTextConfig(selectedArtwork, { textAlign: 'center' })
                              }
                              title="Center multi-line text"
                            >
                              <AlignCenter size={12} />
                            </button>
                            <button
                              type="button"
                              className={
                                selectedArtwork.textConfig.textAlign === 'right' ? 'active' : ''
                              }
                              onClick={() =>
                                handleUpdateTextConfig(selectedArtwork, { textAlign: 'right' })
                              }
                              title="Align multi-line text right"
                            >
                              <AlignRight size={12} />
                            </button>
                          </div>
                          {selectedArtwork.mode === 'print' && (
                            <input
                              type="color"
                              className="color-swatch-input"
                              value={selectedArtwork.textConfig.color}
                              onChange={(e) =>
                                handleUpdateTextConfig(selectedArtwork, { color: e.target.value })
                              }
                              title="Text print color"
                            />
                          )}
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                {/* ALIGN & SNAP TO PIECE TOOLBAR */}
                <div className="align-piece-box">
                  <div className="param-label-row">
                    <span className="mini-heading">
                      Align to Piece ({FACE_OPTIONS.find((f) => f.id === selectedArtwork.faceId)?.label})
                    </span>
                    <div className="margin-inline">
                      <span>Margin ({uLabel})</span>
                      <NumberField
                        valueMm={alignMarginMm}
                        minMm={0}
                        maxMm={40}
                        step={isInch ? 0.05 : 1}
                        displayUnit={displayUnit}
                        inDecimals={2}
                        mmDecimals={1}
                        className="num-field num-field-xs"
                        ariaLabel="Piece Edge Margin"
                        onChangeMm={(mm) => setAlignMarginMm(mm)}
                      />
                    </div>
                  </div>

                  <div className="align-controls-layout">
                    {/* 9-Point Piece Anchor Matrix */}
                    <div className="anchor-grid-9" title="Snap to any corner, edge, or center of the piece">
                      {([-1, 0, 1] as const).map((ay) =>
                        ([-1, 0, 1] as const).map((ax) => (
                          <button
                            key={`${ax}_${ay}`}
                            type="button"
                            className={`anchor-dot-btn ${ax === 0 && ay === 0 ? 'center-dot' : ''}`}
                            onClick={() => handleAlignToPiece(selectedArtwork, ax, ay)}
                            title={`Snap to ${
                              ay === -1 ? 'Top' : ay === 1 ? 'Bottom' : 'Middle'
                            }-${ax === -1 ? 'Left' : ax === 1 ? 'Right' : 'Center'} of piece`}
                          >
                            <span />
                          </button>
                        ))
                      )}
                    </div>

                    {/* Axis Align & Fit to Piece Buttons */}
                    <div className="align-quick-btns">
                      <div className="align-btn-row">
                        <button
                          type="button"
                          className="align-btn"
                          onClick={() => handleAlignToPiece(selectedArtwork, -1, undefined)}
                          title="Align to Left edge of piece"
                        >
                          ⇤ Left
                        </button>
                        <button
                          type="button"
                          className="align-btn"
                          onClick={() => handleAlignToPiece(selectedArtwork, 0, undefined)}
                          title="Center Horizontally on piece"
                        >
                          ↔ Center H
                        </button>
                        <button
                          type="button"
                          className="align-btn"
                          onClick={() => handleAlignToPiece(selectedArtwork, 1, undefined)}
                          title="Align to Right edge of piece"
                        >
                          Right ⇥
                        </button>
                      </div>
                      <div className="align-btn-row">
                        <button
                          type="button"
                          className="align-btn"
                          onClick={() => handleAlignToPiece(selectedArtwork, undefined, -1)}
                          title="Align to Top edge of piece"
                        >
                          ⇡ Top
                        </button>
                        <button
                          type="button"
                          className="align-btn"
                          onClick={() => handleAlignToPiece(selectedArtwork, undefined, 0)}
                          title="Center Vertically on piece"
                        >
                          ↕ Center V
                        </button>
                        <button
                          type="button"
                          className="align-btn"
                          onClick={() => handleAlignToPiece(selectedArtwork, undefined, 1)}
                          title="Align to Bottom edge of piece"
                        >
                          Bottom ⇣
                        </button>
                      </div>
                      <div className="align-btn-row">
                        <button
                          type="button"
                          className="align-btn"
                          onClick={() => handleFitToPiece(selectedArtwork, 'width', 0.78)}
                          title="Scale proportionally to 78% of this piece's width"
                        >
                          Fit Width
                        </button>
                        <button
                          type="button"
                          className="align-btn"
                          onClick={() => handleFitToPiece(selectedArtwork, 'height', 0.5)}
                          title="Scale proportionally to 50% of this piece's height"
                        >
                          Fit Height
                        </button>
                        <button
                          type="button"
                          className="align-btn"
                          onClick={() =>
                            updateArtwork(selectedArtwork.id, {
                              rotationDeg: ((selectedArtwork.rotationDeg + 90 + 180) % 360) - 180,
                            })
                          }
                          title="Rotate 90 degrees"
                        >
                          ↻ 90°
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="move-piece-row">
                    <span>Move to Piece:</span>
                    <select
                      value={selectedArtwork.faceId}
                      onChange={(e) => {
                        const nextFace = e.target.value;
                        updateArtwork(selectedArtwork.id, {
                          faceId: nextFace,
                          xMm: 0,
                          yMm: 0,
                        });
                        setSelectedFaceId(nextFace);
                      }}
                    >
                      {FACE_OPTIONS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="two-col-inputs">
                  <label className="field-block">
                    <span>Width ({uLabel})</span>
                    <NumberField
                      valueMm={selectedArtwork.widthMm}
                      minMm={5}
                      maxMm={300}
                      step={isInch ? 0.05 : 1}
                      displayUnit={displayUnit}
                      inDecimals={2}
                      mmDecimals={1}
                      ariaLabel="Artwork Width"
                      onChangeMm={(mm) => {
                        if (selectedArtwork.textConfig) {
                          const aspect = Math.max(
                            0.1,
                            selectedArtwork.widthMm / Math.max(1, selectedArtwork.heightMm)
                          );
                          updateArtwork(selectedArtwork.id, {
                            widthMm: mm,
                            heightMm: Math.max(4, Number((mm / aspect).toFixed(1))),
                          });
                        } else {
                          updateArtwork(selectedArtwork.id, { widthMm: mm });
                        }
                      }}
                    />
                  </label>
                  <label className="field-block">
                    <span>Height ({uLabel})</span>
                    <NumberField
                      valueMm={selectedArtwork.heightMm}
                      minMm={5}
                      maxMm={300}
                      step={isInch ? 0.05 : 1}
                      displayUnit={displayUnit}
                      inDecimals={2}
                      mmDecimals={1}
                      ariaLabel="Artwork Height"
                      onChangeMm={(mm) => {
                        if (selectedArtwork.textConfig) {
                          const aspect = Math.max(
                            0.1,
                            selectedArtwork.widthMm / Math.max(1, selectedArtwork.heightMm)
                          );
                          updateArtwork(selectedArtwork.id, {
                            heightMm: mm,
                            widthMm: Math.max(5, Number((mm * aspect).toFixed(1))),
                          });
                        } else {
                          updateArtwork(selectedArtwork.id, { heightMm: mm });
                        }
                      }}
                    />
                  </label>
                </div>

                <div className="two-col-inputs">
                  <label className="field-block">
                    <span>Offset X ({uLabel})</span>
                    <NumberField
                      valueMm={selectedArtwork.xMm}
                      minMm={-300}
                      maxMm={300}
                      step={isInch ? 0.05 : 1}
                      displayUnit={displayUnit}
                      inDecimals={2}
                      mmDecimals={1}
                      ariaLabel="Artwork Offset X"
                      onChangeMm={(mm) =>
                        updateArtwork(selectedArtwork.id, { xMm: mm })
                      }
                    />
                  </label>
                  <label className="field-block">
                    <span>Offset Y ({uLabel})</span>
                    <NumberField
                      valueMm={selectedArtwork.yMm}
                      minMm={-300}
                      maxMm={300}
                      step={isInch ? 0.05 : 1}
                      displayUnit={displayUnit}
                      inDecimals={2}
                      mmDecimals={1}
                      ariaLabel="Artwork Offset Y"
                      onChangeMm={(mm) =>
                        updateArtwork(selectedArtwork.id, { yMm: mm })
                      }
                    />
                  </label>
                </div>

                <div className="param-row">
                  <div className="param-label-row">
                    <label>Rotation ({selectedArtwork.rotationDeg}°)</label>
                    <button
                      type="button"
                      className="text-action-btn"
                      onClick={() =>
                        updateArtwork(selectedArtwork.id, {
                          xMm: 0,
                          yMm: 0,
                          rotationDeg: 0,
                        })
                      }
                    >
                      <RotateCcw size={11} /> Reset Center
                    </button>
                  </div>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={5}
                    value={selectedArtwork.rotationDeg}
                    onChange={(e) =>
                      updateArtwork(selectedArtwork.id, {
                        rotationDeg: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            ) : (
              <p className="empty-art-hint">
                No text or graphic on this piece yet. Click <strong>+ Add Text (Font)</strong> or{' '}
                <strong>Upload SVG / PNG</strong> above.
              </p>
            )}
          </section>

          {/* Machine Bed & Sheet Layout Section */}
          <section className="panel-card">
            <div className="section-header">
              <span className="section-title">Machine Bed &amp; Sheet Layout</span>
            </div>

            <label className="field-block">
              <span>Laser / Cutter Bed Size</span>
              <select
                value={params.bedPresetId}
                onChange={(e) => updateParam('bedPresetId', e.target.value)}
              >
                {MACHINE_BED_PRESETS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="two-col-inputs">
              <label className="field-block">
                <span>Part Gap ({uLabel})</span>
                <NumberField
                  valueMm={params.partSpacingMm}
                  minMm={1}
                  maxMm={25}
                  step={isInch ? 0.05 : 1}
                  displayUnit={displayUnit}
                  inDecimals={2}
                  mmDecimals={1}
                  ariaLabel="Part Gap"
                  onChangeMm={(mm) => updateParam('partSpacingMm', mm)}
                />
              </label>
              <label className="field-block">
                <span>Margin ({uLabel})</span>
                <NumberField
                  valueMm={params.sheetMarginMm}
                  minMm={2}
                  maxMm={30}
                  step={isInch ? 0.05 : 1}
                  displayUnit={displayUnit}
                  inDecimals={2}
                  mmDecimals={1}
                  ariaLabel="Sheet Margin"
                  onChangeMm={(mm) => updateParam('sheetMarginMm', mm)}
                />
              </label>
            </div>

            <label className="field-block">
              <span>SVG Scale / Unit Coordinate System</span>
              <select
                value={params.svgUnitMode}
                onChange={(e) =>
                  updateParam(
                    'svgUnitMode',
                    e.target.value as BoxParameters['svgUnitMode']
                  )
                }
              >
                <option value="mm">
                  1:1 Millimeters (xTool Studio / LightBurn Default)
                </option>
                <option value="in">1:1 Inches (width="...in" / Imperial CAD)</option>
                <option value="96dpi">96 DPI CSS Pixels (Inkscape / Web SVG)</option>
                <option value="72dpi">72 DPI Points (Illustrator Legacy)</option>
              </select>
            </label>

            <label className="field-block">
              <span>SVG Grouping Structure</span>
              <select
                value={params.svgGroupingMode || 'by-layer'}
                onChange={(e) =>
                  updateParam(
                    'svgGroupingMode',
                    e.target.value as BoxParameters['svgGroupingMode']
                  )
                }
              >
                <option value="flat-2-objects">
                  xTool Flat (1 Joined Score + 1 Joined Cut Object — 1 Ungroup separates them)
                </option>
                <option value="by-piece">
                  Group by Piece (Locked Cut + Score per Box Piece)
                </option>
                <option value="by-layer">
                  Group by Layer (Score_Lines Group + Cut_Lines Group)
                </option>
              </select>
            </label>

            <div className="checkbox-row">
              <label>
                <input
                  type="checkbox"
                  checked={params.includeScaleBar}
                  onChange={(e) => updateParam('includeScaleBar', e.target.checked)}
                />
                Embed Exact Sheet Frame &amp; 50mm Scale Bar
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={params.includeRegistrationMarks}
                  onChange={(e) =>
                    updateParam('includeRegistrationMarks', e.target.checked)
                  }
                />
                Print+Cut Corner Registration Marks
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={params.showDimensions}
                  onChange={(e) => updateParam('showDimensions', e.target.checked)}
                />
                Show Panel Dimensions on 2D Sheet
              </label>
            </div>

            <div className="dims-readout">
              <div>
                <span>Target Import Size:</span>
                <strong>
                  {fmtDim(model.sheetWidthMm)} × {fmtDim(model.sheetHeightMm)} {uLabel}
                </strong>
              </div>
            </div>

            <div className="profile-info-box">
              <strong>{activeProfile.badge}</strong>
              <p>{activeProfile.notes}</p>
              <p style={{ marginTop: 4, color: 'var(--accent-hover)', fontSize: 10.5 }}>
                💡 <strong>xTool Studio Pro Tip:</strong> Look at the <em>Layer list</em> at the bottom-left of xTool Studio: click the <strong>Blue (#0000FF)</strong> swatch → set to <strong>Score</strong>, and the <strong>Red (#FF0000)</strong> swatch → set to <strong>Cut</strong>. No ungrouping needed! Or click <strong>Split (Cut+Score)</strong> above for 2 separate files.
              </p>
            </div>
          </section>
        </aside>
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
