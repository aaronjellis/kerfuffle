import React, { useState } from 'react';
import { NumberField } from '../../components/NumberField';
import { generatePatternHoles } from '../../engine/facePatterns';
import { DEFAULT_FACE_PATTERN } from '../../engine/presets';
import type { FacePatternSettings, FacePatternStyle } from '../../engine/types';
import { Field } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

const STYLES: { value: FacePatternStyle; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'grid', label: 'Grid' },
  { value: 'checker', label: 'Checker' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'honeycomb', label: 'Honeycomb' },
  { value: 'scallops', label: 'Scallops' },
  { value: 'sunflower', label: 'Sunflower' },
  { value: 'spiral', label: 'Spiral' },
];

const FACE_LABELS: Record<string, string> = {
  top: 'Top',
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
};

const PREVIEW_W = 56;
const PREVIEW_H = 40;

/** One small panel per style, drawn once: the face with its holes, even-odd filled. */
const PREVIEWS: Record<string, string> = Object.fromEntries(
  STYLES.map(({ value }) => {
    const holes = generatePatternHoles({ style: value, cellMm: 9, barMm: 1.8, paddingMm: 4 }, PREVIEW_W, PREVIEW_H);
    const d = holes
      .map((h) => `M${h.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('L')}Z`)
      .join('');
    return [value, `M0 0H${PREVIEW_W}V${PREVIEW_H}H0Z${d}`];
  }),
);

const Preview: React.FC<{ style: FacePatternStyle; className?: string }> = ({ style, className }) => (
  <svg viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`} className={className} aria-hidden="true">
    <path d={PREVIEWS[style]} fillRule="evenodd" />
  </svg>
);

/** A see-through pattern per side: pick a side, then its pattern, cell, bar and border. */
export const PatternSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model }) => {
  const { isInch, uLabel } = unitHelpers(displayUnit);
  const available = model.patternFaceIds;
  const patterns = params.facePatterns;
  const [picked, setPicked] = useState<string | null>(null);
  // Start on a side that already has a pattern; a side the template lacks falls back to the first.
  const face =
    picked && available.includes(picked) ? picked : (available.find((f) => patterns[f]) ?? available[0]);
  const current = face ? patterns[face] : undefined;
  const style = current?.style ?? 'none';

  if (!face) {
    return (
      <p className="helper-note">
        This box has no side that can take a pattern: its walls carry slots or hinge holes, and it has no
        lid panel.
      </p>
    );
  }

  /** A side that gets its first pattern starts from another patterned side's sizes, so sides match. */
  const setFace = (patch: Partial<FacePatternSettings>) => {
    const base = current ?? Object.values(patterns)[0] ?? { style: 'none' as const, ...DEFAULT_FACE_PATTERN };
    updateParam('facePatterns', { ...patterns, [face]: { ...base, ...patch } });
  };
  const setStyle = (next: FacePatternStyle) => {
    if (next === 'none') {
      const { [face]: _removed, ...rest } = patterns;
      updateParam('facePatterns', rest);
    } else {
      setFace({ style: next });
    }
  };
  const applyToAll = () => {
    if (!current) return;
    updateParam('facePatterns', { ...patterns, ...Object.fromEntries(available.map((f) => [f, { ...current }])) });
  };

  return (
    <>
      <Field label="Side" group>
        <div className="chip-row" role="radiogroup" aria-label="Side">
          {available.map((id) => {
            const p = patterns[id];
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={id === face}
                className="chip pattern-side"
                onClick={() => setPicked(id)}
              >
                {p && p.style !== 'none' && <Preview style={p.style} className="pattern-side-icon" />}
                {FACE_LABELS[id] ?? id}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="pattern-picker" role="radiogroup" aria-label={`Pattern on the ${FACE_LABELS[face]?.toLowerCase() ?? face}`}>
        {STYLES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={style === value}
            aria-label={label}
            className="pattern-tile"
            data-ph-capture-attribute-pattern={value}
            onClick={() => setStyle(value)}
          >
            <Preview style={value} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {current && current.style !== 'none' && (
        <>
          <div className="two-col-inputs">
            <Field label={`Cell size (${uLabel})`}>
              <NumberField
                valueMm={current.cellMm}
                minMm={6}
                maxMm={40}
                step={isInch ? 0.05 : 1}
                displayUnit={displayUnit}
                inDecimals={2}
                mmDecimals={1}
                ariaLabel="Pattern cell size"
                onChangeMm={(mm) => setFace({ cellMm: mm })}
              />
            </Field>
            <Field label={`Bar width (${uLabel})`}>
              <NumberField
                valueMm={current.barMm}
                minMm={1}
                maxMm={10}
                step={isInch ? 0.01 : 0.5}
                displayUnit={displayUnit}
                inDecimals={3}
                mmDecimals={1}
                ariaLabel="Pattern bar width"
                onChangeMm={(mm) => setFace({ barMm: mm })}
              />
            </Field>
          </div>
          <Field label={`Padding (${uLabel})`}>
            <NumberField
              valueMm={current.paddingMm}
              minMm={2}
              maxMm={30}
              step={isInch ? 0.05 : 1}
              displayUnit={displayUnit}
              inDecimals={2}
              mmDecimals={1}
              ariaLabel="Pattern padding"
              onChangeMm={(mm) => setFace({ paddingMm: mm })}
            />
          </Field>
          {available.length > 1 && (
            <button type="button" className="btn btn-sm pattern-apply-all" onClick={applyToAll}>
              Use this pattern on every side
            </button>
          )}
          <p className="helper-note">
            Bars thinner than about twice the material thickness can snap; padding is the solid border kept
            around the pattern.
          </p>
        </>
      )}
    </>
  );
};
