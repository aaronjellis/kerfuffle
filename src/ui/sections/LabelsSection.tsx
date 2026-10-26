import React from 'react';
import { RotateCcw } from 'lucide-react';
import { NumberField } from '../../components/NumberField';
import { DEFAULT_FACE_LABELS } from '../../engine/presets';
import type { FaceLabelPosition } from '../../engine/types';
import { Field, Switch } from '../Field';
import { FACE_OPTIONS, unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Single-stroke side names scored onto the inner faces. */
export const LabelsSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, handlers }) => {
  const { isInch, uLabel } = unitHelpers(displayUnit);
  return (
    <>
      <p className="helper-note">
        Single-stroke names on the inner side of each face, on the score layer, so you can tell the parts apart
        after cutting.
      </p>

      <Switch
        label="Score side names onto inner faces"
        checked={params.scoreInnerFaceLabels}
        onChange={(v) => updateParam('scoreInnerFaceLabels', v)}
      />

      <div className="two-col-inputs">
        <Field label="Label position">
          <select
            value={params.faceLabelPosition}
            onChange={(e) => updateParam('faceLabelPosition', e.target.value as FaceLabelPosition)}
          >
            <option value="center">Center of the face</option>
            <option value="bottom">Bottom edge</option>
            <option value="top-left">Top edge</option>
          </select>
        </Field>
        <Field label={`Text size (${uLabel})`}>
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
        </Field>
      </div>

      <Switch
        label="Score panel dimensions under the name"
        checked={params.scoreFaceDimensions}
        onChange={(v) => updateParam('scoreFaceDimensions', v)}
      />
      <Switch
        label="Mirror text for a back-side cut"
        checked={params.mirrorInnerFaceLabels}
        onChange={(v) => updateParam('mirrorInnerFaceLabels', v)}
      />
      <Switch
        label="Guide names in the 2D view"
        checked={params.showGuideLabels2D}
        onChange={(v) => updateParam('showGuideLabels2D', v)}
      />

      <div className="face-names-editor">
        <div className="mini-heading-row">
          <span className="mini-heading">Side names (clear one to skip that face)</span>
          <button
            type="button"
            className="link-btn"
            onClick={() => updateParam('customFaceLabels', { ...DEFAULT_FACE_LABELS })}
          >
            <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" /> Reset
          </button>
        </div>
        <div className="two-col-inputs">
          {FACE_OPTIONS.map((f) => (
            <Field key={f.id} label={f.label}>
              <input
                type="text"
                className="text-field"
                placeholder={`e.g. ${DEFAULT_FACE_LABELS[f.id]}`}
                value={params.customFaceLabels?.[f.id] ?? DEFAULT_FACE_LABELS[f.id] ?? ''}
                onChange={(e) => handlers.updateFaceLabel(f.id, e.target.value)}
              />
            </Field>
          ))}
        </div>
      </div>
    </>
  );
};
