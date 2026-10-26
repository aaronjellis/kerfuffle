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
        Add single-stroke vector names to the inner side of each face on the <strong>Score Layer</strong> so
        parts are labeled after laser cutting.
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
            <option value="center">Center of Face</option>
            <option value="bottom">Bottom Edge / Corner</option>
            <option value="top-left">Top Edge</option>
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
        label="Also score panel dimensions below name"
        checked={params.scoreFaceDimensions}
        onChange={(v) => updateParam('scoreFaceDimensions', v)}
      />
      <Switch
        label="Mirror text (back-side cut)"
        checked={params.mirrorInnerFaceLabels}
        onChange={(v) => updateParam('mirrorInnerFaceLabels', v)}
      />
      <Switch
        label="Show screen-only guide names in 2D preview"
        checked={params.showGuideLabels2D}
        onChange={(v) => updateParam('showGuideLabels2D', v)}
      />

      <div className="face-names-editor">
        <div className="param-label-row" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600 }}>Custom side names (clear to skip a face)</span>
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
