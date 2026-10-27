import React from 'react';
import { NumberField } from '../../components/NumberField';
import { generatePatternHoles } from '../../engine/facePatterns';
import type { FacePatternStyle } from '../../engine/types';
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

/** A see-through pattern cut into the chosen faces, framed by a solid border. */
export const PatternSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model }) => {
  const { isInch, uLabel } = unitHelpers(displayUnit);
  const available = model.patternFaceIds;
  const chosen = params.facePatternFaces.filter((f) => available.includes(f));
  const toggleFace = (id: string) =>
    updateParam(
      'facePatternFaces',
      params.facePatternFaces.includes(id)
        ? params.facePatternFaces.filter((f) => f !== id)
        : [...params.facePatternFaces, id],
    );

  if (available.length === 0) {
    return (
      <p className="helper-note">
        This box has no face that can take a pattern: its walls carry slots or hinge holes, and it has no
        lid panel.
      </p>
    );
  }

  return (
    <>
      <div className="pattern-picker" role="radiogroup" aria-label="Pattern">
        {STYLES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={params.facePatternStyle === value}
            aria-label={label}
            className="pattern-tile"
            data-ph-capture-attribute-pattern={value}
            onClick={() => updateParam('facePatternStyle', value)}
          >
            <svg viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`} aria-hidden="true">
              <path d={PREVIEWS[value]} fillRule="evenodd" />
            </svg>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {params.facePatternStyle !== 'none' && (
        <>
          <Field label="Faces" group>
            <div className="chip-row" role="group" aria-label="Faces">
              {available.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="chip"
                  aria-pressed={params.facePatternFaces.includes(id)}
                  onClick={() => toggleFace(id)}
                >
                  {FACE_LABELS[id] ?? id}
                </button>
              ))}
            </div>
          </Field>
          {chosen.length === 0 && <p className="helper-note">Pick at least one face to cut the pattern into.</p>}

          <div className="two-col-inputs">
            <Field label={`Cell size (${uLabel})`}>
              <NumberField
                valueMm={params.facePatternCellMm}
                minMm={6}
                maxMm={40}
                step={isInch ? 0.05 : 1}
                displayUnit={displayUnit}
                inDecimals={2}
                mmDecimals={1}
                ariaLabel="Pattern cell size"
                onChangeMm={(mm) => updateParam('facePatternCellMm', mm)}
              />
            </Field>
            <Field label={`Bar width (${uLabel})`}>
              <NumberField
                valueMm={params.facePatternBarMm}
                minMm={1}
                maxMm={10}
                step={isInch ? 0.01 : 0.5}
                displayUnit={displayUnit}
                inDecimals={3}
                mmDecimals={1}
                ariaLabel="Pattern bar width"
                onChangeMm={(mm) => updateParam('facePatternBarMm', mm)}
              />
            </Field>
          </div>
          <Field label={`Padding (${uLabel})`}>
            <NumberField
              valueMm={params.facePatternPaddingMm}
              minMm={2}
              maxMm={30}
              step={isInch ? 0.05 : 1}
              displayUnit={displayUnit}
              inDecimals={2}
              mmDecimals={1}
              ariaLabel="Pattern padding"
              onChangeMm={(mm) => updateParam('facePatternPaddingMm', mm)}
            />
          </Field>
          <p className="helper-note">
            Bars thinner than about twice the material thickness can snap; padding is the solid border kept
            around the pattern.
          </p>
        </>
      )}
    </>
  );
};
