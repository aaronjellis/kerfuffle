import React from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  ImagePlus,
  RotateCcw,
  Sparkles,
  Trash2,
  Type,
} from 'lucide-react';
import { NumberField } from '../../components/NumberField';
import { GOOGLE_FONT_CATALOG } from '../../engine/googleFonts';
import { SAMPLE_ARTWORK_PRESETS } from '../../engine/sampleArtworks';
import type { TextArtworkConfig } from '../../engine/types';
import { Field, Segmented } from '../Field';
import { FACE_OPTIONS, unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Text and graphics per face: face picker, upload, Google Font text, and the per-item inspector. */
export const ArtworkSection: React.FC<SectionProps> = ({ displayUnit, handlers }) => {
  const { isInch, uLabel } = unitHelpers(displayUnit);
  const {
    artworks,
    selectedFaceId,
    setSelectedFaceId,
    selectedArtworkId,
    setSelectedArtworkId,
    updateArtwork,
    removeArtwork,
    duplicateArtwork,
    addTextArtwork,
    updateTextConfig,
    uploadInputRef,
    uploadArtwork,
    addSampleArtwork,
    alignArtwork,
    fitArtwork,
    alignMarginMm,
    setAlignMarginMm,
    customFontInput,
    setCustomFontInput,
  } = handlers;
  const selectedArtwork =
    artworks.find((a) => a.id === selectedArtworkId) ||
    artworks.find((a) => a.faceId === selectedFaceId) ||
    null;

  return (
    <>
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
        ref={uploadInputRef}
        type="file"
        accept=".svg,.png,.jpg,.jpeg,.webp"
        style={{ display: 'none' }}
        onChange={uploadArtwork}
      />

      <div className="two-col-inputs">
        <button
          type="button"
          className="upload-art-btn add-text-btn"
          onClick={addTextArtwork}
        >
          <Type size={15} />
          + Add Text (Font)
        </button>
        <button
          type="button"
          className="upload-art-btn"
          onClick={() => uploadInputRef.current?.click()}
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
              onClick={() => addSampleArtwork(sample)}
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
                onClick={() => duplicateArtwork(selectedArtwork)}
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

          <Segmented
            ariaLabel="Artwork mode"
            style={{ marginBottom: 8 }}
            value={selectedArtwork.mode}
            onChange={(mode) => {
              if (selectedArtwork.textConfig) {
                updateTextConfig(selectedArtwork, {}, mode);
              } else {
                updateArtwork(selectedArtwork.id, { mode });
              }
            }}
            options={[
              { value: 'print', label: 'Inkjet Print (Color)' },
              { value: 'engrave', label: 'Laser Engrave' },
            ]}
          />

          {/* GOOGLE FONT TEXT INSPECTOR */}
          {selectedArtwork.textConfig && (
            <div className="text-config-panel">
              <Field label={"Text content (multi-line supported)"}>
                <textarea
                  rows={2}
                  className="text-area-field"
                  value={selectedArtwork.textConfig.text}
                  onChange={(e) =>
                    updateTextConfig(selectedArtwork, { text: e.target.value })
                  }
                  placeholder="Enter text..."
                />
              </Field>

              <Field label={"Google font family"}>
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
                      updateTextConfig(selectedArtwork, {
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
              </Field>

              <div className="custom-font-row">
                <input
                  type="text"
                  className="text-field"
                  placeholder="Or type any Google Font (e.g. Lobster, Orbitron)..."
                  value={customFontInput}
                  onChange={(e) => setCustomFontInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customFontInput.trim()) {
                      updateTextConfig(selectedArtwork, {
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
                      updateTextConfig(selectedArtwork, {
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
                <Field label={"Weight and style"}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <select
                      value={selectedArtwork.textConfig.fontWeight}
                      onChange={(e) =>
                        updateTextConfig(selectedArtwork, {
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
                        updateTextConfig(selectedArtwork, {
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
                </Field>

                <Field label={"Line align and color"}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <Segmented
                      ariaLabel="Line align"
                      style={{ flex: 1 }}
                      value={selectedArtwork.textConfig.textAlign}
                      onChange={(textAlign) => updateTextConfig(selectedArtwork, { textAlign })}
                      options={[
                        { value: 'left', label: <AlignLeft size={12} />, title: 'Align multi-line text left' },
                        { value: 'center', label: <AlignCenter size={12} />, title: 'Center multi-line text' },
                        { value: 'right', label: <AlignRight size={12} />, title: 'Align multi-line text right' },
                      ]}
                    />
                    {selectedArtwork.mode === 'print' && (
                      <input
                        type="color"
                        className="color-swatch-input"
                        value={selectedArtwork.textConfig.color}
                        onChange={(e) =>
                          updateTextConfig(selectedArtwork, { color: e.target.value })
                        }
                        title="Text print color"
                      />
                    )}
                  </div>
                </Field>
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
                      onClick={() => alignArtwork(selectedArtwork, ax, ay)}
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
                    onClick={() => alignArtwork(selectedArtwork, -1, undefined)}
                    title="Align to Left edge of piece"
                  >
                    ⇤ Left
                  </button>
                  <button
                    type="button"
                    className="align-btn"
                    onClick={() => alignArtwork(selectedArtwork, 0, undefined)}
                    title="Center Horizontally on piece"
                  >
                    ↔ Center H
                  </button>
                  <button
                    type="button"
                    className="align-btn"
                    onClick={() => alignArtwork(selectedArtwork, 1, undefined)}
                    title="Align to Right edge of piece"
                  >
                    Right ⇥
                  </button>
                </div>
                <div className="align-btn-row">
                  <button
                    type="button"
                    className="align-btn"
                    onClick={() => alignArtwork(selectedArtwork, undefined, -1)}
                    title="Align to Top edge of piece"
                  >
                    ⇡ Top
                  </button>
                  <button
                    type="button"
                    className="align-btn"
                    onClick={() => alignArtwork(selectedArtwork, undefined, 0)}
                    title="Center Vertically on piece"
                  >
                    ↕ Center V
                  </button>
                  <button
                    type="button"
                    className="align-btn"
                    onClick={() => alignArtwork(selectedArtwork, undefined, 1)}
                    title="Align to Bottom edge of piece"
                  >
                    Bottom ⇣
                  </button>
                </div>
                <div className="align-btn-row">
                  <button
                    type="button"
                    className="align-btn"
                    onClick={() => fitArtwork(selectedArtwork, 'width', 0.78)}
                    title="Scale proportionally to 78% of this piece's width"
                  >
                    Fit Width
                  </button>
                  <button
                    type="button"
                    className="align-btn"
                    onClick={() => fitArtwork(selectedArtwork, 'height', 0.5)}
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
            <Field label={`Width (${uLabel})`}>
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
            </Field>
            <Field label={`Height (${uLabel})`}>
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
            </Field>
          </div>

          <div className="two-col-inputs">
            <Field label={`Offset X (${uLabel})`}>
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
            </Field>
            <Field label={`Offset Y (${uLabel})`}>
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
            </Field>
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
    </>
  );
};
