import React, { useEffect, useId, useMemo, useState } from 'react';
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
  X,
} from 'lucide-react';
import { NumberField } from '../../components/NumberField';
import { fetchFontMeta, offeredWeights, type TextWeight } from '../../engine/fontSource';
import { fetchFontCatalog, type FontFamily } from '../../engine/fontCatalog';
import { resolvePieceDimensions } from '../../engine/googleFonts';
import { loadPreviewCss } from '../../engine/previewFonts';
import { FontPicker } from '../FontPicker';
import { SAMPLE_ARTWORK_PRESETS } from '../../engine/sampleArtworks';
import type { FaceArtwork, TextArtworkConfig } from '../../engine/types';
import { Field, Segmented } from '../Field';
import { FACE_OPTIONS, unitHelpers } from './shared';
import type { SectionProps } from './types';

/** One catalog fetch for the session: the section and the picker both need it. */
let catalogRequest: Promise<FontFamily[]> | null = null;
const loadCatalog = () => (catalogRequest ??= fetchFontCatalog());

const WEIGHT_LABELS: Record<TextWeight, string> = {
  '400': 'Regular (400)',
  '600': 'Semibold (600)',
  '700': 'Bold (700)',
  '800': 'Extra bold (800)',
};

/** The weights and slants a font really has; null until known, or when it can't be looked up. */
function useFontVariants(family: string | undefined): { weights: number[]; styles: string[] } | null {
  const [variants, setVariants] = useState<{ family: string; weights: number[]; styles: string[] } | null>(null);
  useEffect(() => {
    if (!family) return;
    let live = true;
    fetchFontMeta(family).then((meta) => {
      if (live) setVariants(meta ? { family, weights: meta.weights, styles: meta.styles } : null);
    });
    return () => {
      live = false;
    };
  }, [family]);
  return variants && variants.family === family ? variants : null;
}

const anchorName = (ax: -1 | 0 | 1, ay: -1 | 0 | 1): string => {
  if (ax === 0 && ay === 0) return 'Snap to the center';
  const v = ay === -1 ? 'top' : ay === 1 ? 'bottom' : '';
  const h = ax === -1 ? 'left' : ax === 1 ? 'right' : '';
  return `Snap to the ${[v, h].filter(Boolean).join(' ')}${v && h ? ' corner' : ' edge'}`;
};

/**
 * The artwork resized so `side` becomes `mm`, the other side following: text and images keep their
 * proportions (an image is drawn fitted to its box, so changing one side alone would only pad it).
 */
const scaleTo = (art: FaceArtwork, side: 'widthMm' | 'heightMm', mm: number): Pick<FaceArtwork, 'widthMm' | 'heightMm'> => {
  const k = mm / Math.max(0.1, art[side]);
  const round = (v: number) => Math.round(v * 10) / 10;
  return { widthMm: Math.max(1, round(art.widthMm * k)), heightMm: Math.max(1, round(art.heightMm * k)) };
};

/** Text and graphics per face: face picker, upload, Google Font text, and the per-item inspector. */
export const ArtworkSection: React.FC<SectionProps> = ({ displayUnit, handlers, model }) => {
  const { isInch, uLabel, fmtDim } = unitHelpers(displayUnit);
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
  } = handlers;
  const [catalog, setCatalog] = useState<FontFamily[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    let live = true;
    void loadCatalog().then((families) => live && setCatalog(families));
    return () => {
      live = false;
    };
  }, []);
  const rotationId = useId();
  const sizeId = useId();
  const selectedArtwork =
    artworks.find((a) => a.id === selectedArtworkId) ||
    artworks.find((a) => a.faceId === selectedFaceId) ||
    null;
  const fontVariants = useFontVariants(selectedArtwork?.textConfig?.fontFamily);

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

      <ItemList
        items={artworks.filter((a) => a.faceId === selectedFaceId)}
        pieceLabel={FACE_OPTIONS.find((f) => f.id === selectedFaceId)?.label ?? 'this piece'}
        selectedId={selectedArtwork?.id ?? null}
        onSelect={setSelectedArtworkId}
        onRemove={removeArtwork}
      />

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

              <Field label="Font" group>
                <FontButton config={selectedArtwork.textConfig} onOpen={() => setPickerOpen(true)} />
              </Field>

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
                      {(fontVariants ? offeredWeights(fontVariants.weights) : (Object.keys(WEIGHT_LABELS) as TextWeight[])).map(
                        (w) => (
                          <option key={w} value={w}>
                            {WEIGHT_LABELS[w]}
                          </option>
                        )
                      )}
                    </select>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-pressed={selectedArtwork.textConfig.fontStyle === 'italic'}
                      aria-label="Italic"
                      disabled={Boolean(fontVariants && !fontVariants.styles.includes('italic'))}
                      onClick={() =>
                        updateTextConfig(selectedArtwork, {
                          fontStyle:
                            selectedArtwork.textConfig?.fontStyle === 'italic'
                              ? 'normal'
                              : 'italic',
                        })
                      }
                      title={
                        fontVariants && !fontVariants.styles.includes('italic')
                          ? `${selectedArtwork.textConfig.fontFamily} has no italic`
                          : 'Italic'
                      }
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

          {(() => {
            // The longer side, from 5 mm up to the piece's own longer side.
            const piece = resolvePieceDimensions(model, selectedArtwork.faceId);
            const longSide = Math.max(selectedArtwork.widthMm, selectedArtwork.heightMm);
            const maxSide = Math.max(10, Math.round(Math.max(piece.widthMm, piece.heightMm)));
            return (
              <div className="param-row">
                <div className="param-label-row">
                  <label htmlFor={sizeId}>
                    Size {fmtDim(longSide)} {uLabel}
                  </label>
                </div>
                <input
                  type="range"
                  min={5}
                  max={Math.max(maxSide, Math.ceil(longSide))}
                  step={0.5}
                  id={sizeId}
                  value={longSide}
                  aria-label="Artwork size"
                  onChange={(e) => {
                    const side = Number(e.target.value);
                    updateArtwork(
                      selectedArtwork.id,
                      scaleTo(selectedArtwork, selectedArtwork.widthMm >= selectedArtwork.heightMm ? 'widthMm' : 'heightMm', side)
                    );
                  }}
                />
              </div>
            );
          })()}

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
                onChangeMm={(mm) => updateArtwork(selectedArtwork.id, scaleTo(selectedArtwork, 'widthMm', mm))}
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
                onChangeMm={(mm) => updateArtwork(selectedArtwork.id, scaleTo(selectedArtwork, 'heightMm', mm))}
              />
            </Field>
          </div>

          {(() => {
            // Each slider spans the offsets that keep the artwork on its piece (at least the piece's
            // own half-size, when the artwork is larger). Up is positive on the vertical slider;
            // the stored offset runs down the piece, as on the sheet.
            const piece = resolvePieceDimensions(model, selectedArtwork.faceId);
            const reach = (pieceSide: number, artSide: number) =>
              Math.max(1, Math.round(Math.max(pieceSide - artSide, pieceSide / 2)) / 2);
            const rx = Math.max(reach(piece.widthMm, selectedArtwork.widthMm), Math.ceil(Math.abs(selectedArtwork.xMm)));
            const ry = Math.max(reach(piece.heightMm, selectedArtwork.heightMm), Math.ceil(Math.abs(selectedArtwork.yMm)));
            return (
              <div className="art-position">
                <div className="art-position-v">
                  <span>Up</span>
                  <input
                    type="range"
                    className="range-vertical"
                    min={-ry}
                    max={ry}
                    step={0.5}
                    value={-selectedArtwork.yMm}
                    aria-label="Move artwork up or down"
                    aria-valuetext={`${fmtDim(Math.abs(selectedArtwork.yMm))} ${uLabel} ${selectedArtwork.yMm <= 0 ? 'up' : 'down'}`}
                    onChange={(e) => updateArtwork(selectedArtwork.id, { yMm: -Number(e.target.value) })}
                  />
                  <span>Down</span>
                </div>
                <div className="art-position-h">
                  <span className="art-position-label">Position</span>
                  <input
                    type="range"
                    min={-rx}
                    max={rx}
                    step={0.5}
                    value={selectedArtwork.xMm}
                    aria-label="Move artwork left or right"
                    aria-valuetext={`${fmtDim(Math.abs(selectedArtwork.xMm))} ${uLabel} ${selectedArtwork.xMm < 0 ? 'left' : 'right'}`}
                    onChange={(e) => updateArtwork(selectedArtwork.id, { xMm: Number(e.target.value) })}
                  />
                  <div className="art-position-ends">
                    <span>Left</span>
                    <span>Right</span>
                  </div>
                </div>
              </div>
            );
          })()}

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
              <label htmlFor={rotationId}>Rotation {selectedArtwork.rotationDeg}°</label>
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
              id={rotationId}
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
      {pickerOpen && selectedArtwork?.textConfig && (
        <FontPicker
          catalog={catalog}
          value={selectedArtwork.textConfig.fontFamily}
          sampleText={selectedArtwork.textConfig.text.split(/\r?\n/)[0].slice(0, 24)}
          weight={Number(selectedArtwork.textConfig.fontWeight) || 400}
          style={selectedArtwork.textConfig.fontStyle}
          onPick={(f) => updateTextConfig(selectedArtwork, { fontFamily: f.family })}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
};

/** The Font button: the family's name in its own face, opening the picker. */
const FontButton: React.FC<{ config: TextArtworkConfig; onOpen: () => void }> = ({ config, onOpen }) => {
  const weight = Number(config.fontWeight) || 400;
  useEffect(() => {
    void loadPreviewCss([{ family: config.fontFamily, weight, style: config.fontStyle }]);
  }, [config.fontFamily, weight, config.fontStyle]);
  const face = useMemo(() => `"${config.fontFamily.replace(/["\\]/g, '')}", sans-serif`, [config.fontFamily]);
  return (
    <button type="button" className="btn font-button" aria-haspopup="dialog" onClick={onOpen}>
      <span className="font-button-name" style={{ fontFamily: face, fontWeight: weight, fontStyle: config.fontStyle }}>
        {config.fontFamily}
      </span>
    </button>
  );
};

/** Each item's name, numbered when the piece holds more than one of the same name. */
const itemLabels = (items: FaceArtwork[]): string[] => {
  const total = new Map<string, number>();
  for (const a of items) total.set(a.name, (total.get(a.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return items.map((a) => {
    if ((total.get(a.name) ?? 0) < 2) return a.name;
    const n = (seen.get(a.name) ?? 0) + 1;
    seen.set(a.name, n);
    return `${a.name} ${n}`;
  });
};

/**
 * Everything on the piece, one row each, so every item stays in view on a phone: tap a row to edit
 * it, or remove it from its own row. With several items, "Remove all" asks for a second tap.
 */
const ItemList: React.FC<{
  items: FaceArtwork[];
  pieceLabel: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}> = ({ items, pieceLabel, selectedId, onSelect, onRemove }) => {
  const [confirmAll, setConfirmAll] = useState(false);
  useEffect(() => {
    if (!confirmAll) return;
    const t = window.setTimeout(() => setConfirmAll(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmAll]);
  useEffect(() => setConfirmAll(false), [items.length]);
  if (items.length === 0) return null;
  const labels = itemLabels(items);
  return (
    <div className="face-layer-list">
      <div className="mini-heading-row">
        <span className="mini-heading">
          On the {pieceLabel.toLowerCase()} <span className="count">{items.length}</span>
        </span>
        {items.length > 1 && (
          <button
            type="button"
            className={confirmAll ? 'link-btn link-btn-danger' : 'link-btn'}
            onClick={() => {
              if (!confirmAll) return setConfirmAll(true);
              items.forEach((a) => onRemove(a.id));
            }}
          >
            <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
            {confirmAll ? `Tap again to remove ${items.length}` : 'Remove all'}
          </button>
        )}
      </div>
      {/* Names are the user's own text or file names: PostHog skips the list. */}
      <ul className="layer-list ph-no-capture" aria-label={`Items on the ${pieceLabel.toLowerCase()}`} data-ph-no-capture>
        {items.map((item, i) => (
          <li key={item.id} className="layer-row" aria-current={item.id === selectedId ? 'true' : undefined}>
            <button type="button" className="layer-pick" onClick={() => onSelect(item.id)}>
              <span className="layer-thumb" aria-hidden="true">
                {item.dataUrl ? (
                  <img src={item.dataUrl} alt="" />
                ) : item.textConfig ? (
                  <Type size={16} strokeWidth={1.75} />
                ) : (
                  <ImagePlus size={16} strokeWidth={1.75} />
                )}
              </span>
              <span className="layer-name">{labels[i]}</span>
            </button>
            <button
              type="button"
              className="icon-btn icon-btn-danger layer-remove"
              onClick={() => onRemove(item.id)}
              aria-label={`Remove ${labels[i]}`}
              title={`Remove ${labels[i]}`}
            >
              <X size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
