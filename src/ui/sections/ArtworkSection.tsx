import React from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  ImagePlus,
  Italic,
  RotateCcw,
  RotateCw,
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

const anchorName = (ax: -1 | 0 | 1, ay: -1 | 0 | 1): string => {
  if (ax === 0 && ay === 0) return 'Snap to the center';
  const v = ay === -1 ? 'top' : ay === 1 ? 'bottom' : '';
  const h = ax === -1 ? 'left' : ax === 1 ? 'right' : '';
  return `Snap to the ${[v, h].filter(Boolean).join(' ')}${v && h ? ' corner' : ' edge'}`;
};

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
        Pick a piece, add text in any Google Font or an SVG or PNG graphic, then snap it to an edge or the center.
      </p>

      <div className="chip-row" role="group" aria-label="Piece">
        {FACE_OPTIONS.map((f) => {
          const count = artworks.filter((a) => a.faceId === f.id).length;
          return (
            <button
              key={f.id}
              type="button"
              className="chip"
              aria-pressed={selectedFaceId === f.id}
              data-ph-capture-attribute-face={f.id}
              onClick={() => setSelectedFaceId(f.id)}
            >
              {f.label}
              {count > 0 && <span className="count">{count}</span>}
            </button>
          );
        })}
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        accept=".svg,.png,.jpg,.jpeg,.webp"
        className="visually-hidden-input"
        onChange={uploadArtwork}
      />

      <div className="two-col-inputs">
        <button
          type="button"
          className="btn"
          onClick={addTextArtwork}
        >
          <Type size={18} strokeWidth={1.75} aria-hidden="true" />
          Add text
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => uploadInputRef.current?.click()}
        >
          <ImagePlus size={18} strokeWidth={1.75} aria-hidden="true" />
          Upload image
        </button>
      </div>

      <div className="sample-stamps-block">
        <span className="mini-heading">
          <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" /> Sample graphics
        </span>
        <div className="chip-row" role="group" aria-label="Sample graphics">
          {SAMPLE_ARTWORK_PRESETS.map((sample) => (
            <button
              key={sample.id}
              type="button"
              className="chip"
              data-ph-capture-attribute-sample={sample.id}
              onClick={() => addSampleArtwork(sample)}
            >
              {sample.name}
            </button>
          ))}
        </div>
      </div>

      {/* With more than one item on the piece, a chip per item picks which one to edit. */}
      {artworks.filter((a) => a.faceId === selectedFaceId).length > 1 && (
        <div className="face-layer-list">
          <span className="mini-heading">
            Items on {FACE_OPTIONS.find((f) => f.id === selectedFaceId)?.label}
          </span>
          <div className="chip-row" role="group" aria-label="Items on this piece">
            {artworks
              .filter((a) => a.faceId === selectedFaceId)
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  // The chip shows the user's own text or file name: PostHog skips it.
                  className="chip layer-chip ph-no-capture"
                  aria-pressed={selectedArtwork?.id === item.id}
                  data-ph-no-capture
                  onClick={() => setSelectedArtworkId(item.id)}
                >
                  {item.textConfig ? (
                    <Type size={16} strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <ImagePlus size={16} strokeWidth={1.75} aria-hidden="true" />
                  )}
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
            <div className="art-inspector-actions">
              <button
                type="button"
                className="icon-btn"
                onClick={() => duplicateArtwork(selectedArtwork)}
                aria-label="Duplicate this item"
                title="Duplicate this item"
              >
                <Copy size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                onClick={() => removeArtwork(selectedArtwork.id)}
                aria-label="Remove this item"
                title="Remove this item"
              >
                <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </div>

          <Segmented
            ariaLabel="Artwork mode"
            value={selectedArtwork.mode}
            onChange={(mode) => {
              if (selectedArtwork.textConfig) {
                updateTextConfig(selectedArtwork, {}, mode);
              } else {
                updateArtwork(selectedArtwork.id, { mode });
              }
            }}
            options={[
              { value: 'print', label: 'Print in color' },
              { value: 'engrave', label: 'Engrave' },
            ]}
          />

          {/* Text: content, font, weight, alignment and color. */}
          {selectedArtwork.textConfig && (
            <div className="text-config-panel">
              <Field label="Text">
                <textarea
                  rows={2}
                  value={selectedArtwork.textConfig.text}
                  onChange={(e) =>
                    updateTextConfig(selectedArtwork, { text: e.target.value })
                  }
                  placeholder="Your text"
                />
              </Field>

              <Field label="Font">
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
                  placeholder="Or any Google Font, like Lobster"
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
                  className="btn"
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
                  Load
                </button>
              </div>

              <div className="two-col-inputs">
                <Field label="Weight and style" group>
                  <div className="control-pair">
                    <select
                      aria-label="Weight"
                      value={selectedArtwork.textConfig.fontWeight}
                      onChange={(e) =>
                        updateTextConfig(selectedArtwork, {
                          fontWeight: e.target.value as TextArtworkConfig['fontWeight'],
                        })
                      }
                    >
                      <option value="400">Regular (400)</option>
                      <option value="600">Semibold (600)</option>
                      <option value="700">Bold (700)</option>
                      <option value="800">Extra bold (800)</option>
                    </select>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-pressed={selectedArtwork.textConfig.fontStyle === 'italic'}
                      aria-label="Italic"
                      onClick={() =>
                        updateTextConfig(selectedArtwork, {
                          fontStyle:
                            selectedArtwork.textConfig?.fontStyle === 'italic'
                              ? 'normal'
                              : 'italic',
                        })
                      }
                      title="Italic"
                    >
                      <Italic size={18} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                </Field>

                <Field label="Line align and color" group>
                  <div className="control-pair">
                    <Segmented
                      ariaLabel="Line align"
                      value={selectedArtwork.textConfig.textAlign}
                      onChange={(textAlign) => updateTextConfig(selectedArtwork, { textAlign })}
                      options={[
                        { value: 'left', label: <AlignLeft size={16} strokeWidth={1.75} />, title: 'Align left' },
                        { value: 'center', label: <AlignCenter size={16} strokeWidth={1.75} />, title: 'Center' },
                        { value: 'right', label: <AlignRight size={16} strokeWidth={1.75} />, title: 'Align right' },
                      ]}
                    />
                    {selectedArtwork.mode === 'print' && (
                      <input
                        type="color"
                        value={selectedArtwork.textConfig.color}
                        onChange={(e) =>
                          updateTextConfig(selectedArtwork, { color: e.target.value })
                        }
                        title="Text color"
                        aria-label="Text color"
                      />
                    )}
                  </div>
                </Field>
              </div>
            </div>
          )}

          {/* Snap to the piece: nine anchors, axis alignment, fit and rotate. */}
          <div className="align-piece-box">
            <div className="mini-heading-row">
              <span className="mini-heading">Align on the piece</span>
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
                  ariaLabel="Margin"
                  onChangeMm={(mm) => setAlignMarginMm(mm)}
                />
              </div>
            </div>

            <div className="align-controls-layout">
              <div className="anchor-grid-9" role="group" aria-label="Snap to">
                {([-1, 0, 1] as const).map((ay) =>
                  ([-1, 0, 1] as const).map((ax) => (
                    <button
                      key={`${ax}_${ay}`}
                      type="button"
                      className={ax === 0 && ay === 0 ? 'anchor-dot-btn center-dot' : 'anchor-dot-btn'}
                      onClick={() => alignArtwork(selectedArtwork, ax, ay)}
                      title={anchorName(ax, ay)}
                      aria-label={anchorName(ax, ay)}
                    >
                      <span />
                    </button>
                  ))
                )}
              </div>

              <div className="align-quick-btns">
                <div className="align-btn-row">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => alignArtwork(selectedArtwork, -1, undefined)}
                    title="Align to the left edge"
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => alignArtwork(selectedArtwork, 0, undefined)}
                    title="Center across"
                  >
                    Center
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => alignArtwork(selectedArtwork, 1, undefined)}
                    title="Align to the right edge"
                  >
                    Right
                  </button>
                </div>
                <div className="align-btn-row">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => alignArtwork(selectedArtwork, undefined, -1)}
                    title="Align to the top edge"
                  >
                    Top
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => alignArtwork(selectedArtwork, undefined, 0)}
                    title="Center up and down"
                  >
                    Middle
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => alignArtwork(selectedArtwork, undefined, 1)}
                    title="Align to the bottom edge"
                  >
                    Bottom
                  </button>
                </div>
                <div className="align-btn-row">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => fitArtwork(selectedArtwork, 'width', 0.78)}
                    title="Scale to 78% of the piece's width"
                  >
                    Fit width
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => fitArtwork(selectedArtwork, 'height', 0.5)}
                    title="Scale to 50% of the piece's height"
                  >
                    Fit height
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      updateArtwork(selectedArtwork.id, {
                        rotationDeg: ((selectedArtwork.rotationDeg + 90 + 180) % 360) - 180,
                      })
                    }
                    title="Rotate 90°"
                    aria-label="Rotate 90°"
                  >
                    <RotateCw size={16} strokeWidth={1.75} aria-hidden="true" />
                    90°
                  </button>
                </div>
              </div>
            </div>

            <div className="move-piece-row">
              <span>Move to</span>
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
                ariaLabel="Artwork width"
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
                ariaLabel="Artwork height"
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
                ariaLabel="Artwork offset X"
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
                ariaLabel="Artwork offset Y"
                onChangeMm={(mm) =>
                  updateArtwork(selectedArtwork.id, { yMm: mm })
                }
              />
            </Field>
          </div>

          <div className="param-row">
            <div className="param-label-row">
              <label>Rotation {selectedArtwork.rotationDeg}°</label>
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  updateArtwork(selectedArtwork.id, {
                    xMm: 0,
                    yMm: 0,
                    rotationDeg: 0,
                  })
                }
              >
                <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" /> Reset position
              </button>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={5}
              value={selectedArtwork.rotationDeg}
              aria-label="Rotation"
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
          Nothing on this piece yet. Use <strong>Add text</strong> or <strong>Upload image</strong> above.
        </p>
      )}
    </>
  );
};
