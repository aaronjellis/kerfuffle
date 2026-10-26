import React from 'react';
import { NumberField } from '../../components/NumberField';
import type { BoxParameters } from '../../engine/types';
import { Field } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Living-hinge box: how the flex panel attaches, and its kerf pitch. */
export const LivingHingeSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit }) => {
  const { isInch, uLabel } = unitHelpers(displayUnit);
  return (
    <>
      <Field label="Wall attachment mode">
        <select
          value={params.livingHingeAttachMode}
          onChange={(e) =>
            updateParam('livingHingeAttachMode', e.target.value as BoxParameters['livingHingeAttachMode'])
          }
        >
          <option value="one-piece-back">1-Piece Integrated Back Wall + Front Catch Slot</option>
          <option value="side-arch-tabs">1-Piece Back Wall + Top-Deck Side Retainer Tabs</option>
          <option value="finger-joint-back">2-Piece Finger-Jointed to Back Wall + Front Catch</option>
        </select>
      </Field>

      <div className="param-row">
        <div className="param-label-row">
          <label>Living hinge kerf pitch ({uLabel})</label>
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
          aria-label="Living hinge kerf pitch slider"
          onChange={(e) => updateParam('livingHingePitchMm', Number(e.target.value))}
        />
      </div>
    </>
  );
};
