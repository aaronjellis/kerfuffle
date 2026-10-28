import React from 'react';
import { NumberField } from '../../components/NumberField';
import type { BoxParameters } from '../../engine/types';
import { Field } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Finger-joint box: the lid style, and a telescoping lid's depth and fit. Clamshell: the lid height. */
export const LidSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit }) => {
  const { isInch, uLabel } = unitHelpers(displayUnit);
  return (
    <>
      {params.templateId === 'finger-basic' && (
        <Field label="Lid style">
          <select
            value={params.woodLidStyle}
            onChange={(e) => updateParam('woodLidStyle', e.target.value as BoxParameters['woodLidStyle'])}
          >
            <option value="flat-lid">Flat lift-off lid</option>
            <option value="inset-lid">Lift-off lid with an inner lip</option>
            <option value="closed">Closed, six sides</option>
            <option value="telescope-lid">Telescoping lid (shoebox)</option>
            <option value="open">Open-top tray, five sides</option>
          </select>
        </Field>
      )}

      {params.templateId === 'finger-basic' && params.woodLidStyle === 'telescope-lid' && (
        <>
          <div className="two-col-inputs">
            <Field label={`Lid depth (${uLabel})`}>
              <NumberField
                valueMm={params.lidHeightMm}
                minMm={8}
                maxMm={Math.max(8, params.heightMm + params.materialThicknessMm)}
                step={isInch ? 0.05 : 1}
                displayUnit={displayUnit}
                inDecimals={2}
                mmDecimals={1}
                ariaLabel="Telescoping lid depth"
                onChangeMm={(mm) => updateParam('lidHeightMm', mm)}
              />
            </Field>
            <Field label={`Lid clearance (${uLabel})`}>
              <NumberField
                valueMm={params.woodLidClearanceMm}
                minMm={0}
                maxMm={3}
                step={isInch ? 0.005 : 0.1}
                displayUnit={displayUnit}
                inDecimals={3}
                mmDecimals={2}
                ariaLabel="Telescoping lid clearance"
                onChangeMm={(mm) => updateParam('woodLidClearanceMm', mm)}
              />
            </Field>
          </div>
          <p className="helper-note">
            The lid is a second tray that slides down over the box. Clearance is the gap on each side between
            the lid's skirt and the box; 0.3 to 0.5 mm slides snugly in plywood. Lid depth is how far the skirt
            reaches down; the full box height covers it completely.
          </p>
        </>
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
            ariaLabel="Lid height"
            onChangeMm={(mm) => updateParam('lidHeightMm', mm)}
          />
        </Field>
      )}
    </>
  );
};
