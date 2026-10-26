import React from 'react';
import { NumberField } from '../../components/NumberField';
import type { BoxParameters } from '../../engine/types';
import { Field } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Finger-joint box: the lid style. Clamshell: the lid height. */
export const LidSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit }) => {
  const { isInch, uLabel } = unitHelpers(displayUnit);
  return (
    <>
      {params.templateId === 'finger-basic' && (
        <Field label="Top / lid construction">
          <select
            value={params.woodLidStyle}
            onChange={(e) => updateParam('woodLidStyle', e.target.value as BoxParameters['woodLidStyle'])}
          >
            <option value="flat-lid">Flat Lift-Off Lid</option>
            <option value="inset-lid">Lift-Off Lid + Inner Retainer Lip</option>
            <option value="closed">6-Sided Interlocking Finger Box</option>
            <option value="open">Open-Top 5-Sided Tray</option>
          </select>
        </Field>
      )}

      {params.templateId === 'finger-clamshell' && (
        <Field label={`Lid height (${uLabel})`}>
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
        </Field>
      )}
    </>
  );
};
