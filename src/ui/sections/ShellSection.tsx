import React from 'react';
import { NumberField } from '../../components/NumberField';
import { CLASP_THUMB_FLARE, computePrintBoxDims } from '../../engine/printParts';
import { Field } from '../Field';
import { DROPPED_NOTES, unitHelpers } from './shared';
import type { SectionProps } from './types';

/** 3D box: the two printed shells and where they split. */
export const ShellSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model }) => {
  const { isInch, uLabel, fmtDim } = unitHelpers(displayUnit);
  const { innerDims } = model;
  const dims = computePrintBoxDims(params, innerDims.widthMm, innerDims.depthMm, innerDims.heightMm);
  // Knuckles stand off the back face by the radial clearance plus their diameter.
  const behind = dims.hinge ? 2 * dims.hinge.R + 0.3 : 0;
  const inFront = dims.clasp ? dims.clasp.standoff + dims.clasp.tongueT + CLASP_THUMB_FLARE : 0;
  return (
    <>
      <div className="two-col-inputs">
        <Field label={`Wall thickness (${uLabel})`}>
          <NumberField
            valueMm={params.wallThickness3dMm}
            minMm={1.2}
            maxMm={8.0}
            step={isInch ? 0.01 : 0.4}
            displayUnit={displayUnit}
            inDecimals={3}
            mmDecimals={2}
            ariaLabel="Wall thickness"
            onChangeMm={(mm) => updateParam('wallThickness3dMm', mm)}
          />
        </Field>
        <Field label={`Floor and lid (${uLabel})`}>
          <NumberField
            valueMm={params.floorThickness3dMm}
            minMm={1.2}
            maxMm={6.0}
            step={isInch ? 0.01 : 0.2}
            displayUnit={displayUnit}
            inDecimals={3}
            mmDecimals={2}
            ariaLabel="Floor thickness"
            onChangeMm={(mm) => updateParam('floorThickness3dMm', mm)}
          />
        </Field>
      </div>

      <div className="two-col-inputs">
        <Field label={`Inner fillet (${uLabel})`}>
          <NumberField
            valueMm={params.innerFilletMm}
            minMm={0}
            maxMm={25}
            step={isInch ? 0.02 : 0.5}
            displayUnit={displayUnit}
            inDecimals={2}
            mmDecimals={1}
            ariaLabel="Inner fillet"
            onChangeMm={(mm) => updateParam('innerFilletMm', mm)}
          />
        </Field>
        <Field label={`Outer fillet (${uLabel})`}>
          <NumberField
            valueMm={params.outerFilletMm}
            minMm={0}
            maxMm={25}
            step={isInch ? 0.02 : 0.5}
            displayUnit={displayUnit}
            inDecimals={2}
            mmDecimals={1}
            ariaLabel="Outer fillet"
            onChangeMm={(mm) => updateParam('outerFilletMm', mm)}
          />
        </Field>
      </div>

      <div className="two-col-inputs">
        <Field label={`45° bed chamfer (${uLabel})`}>
          <NumberField
            valueMm={params.outerChamferMm}
            minMm={0}
            maxMm={4.0}
            step={isInch ? 0.01 : 0.2}
            displayUnit={displayUnit}
            inDecimals={3}
            mmDecimals={2}
            ariaLabel="Bed chamfer"
            onChangeMm={(mm) => updateParam('outerChamferMm', mm)}
          />
        </Field>
        <Field label={`Lid split height (${uLabel})`}>
          <NumberField
            valueMm={params.lidHeightMm}
            minMm={10}
            maxMm={Math.max(10, params.heightMm - 10)}
            step={isInch ? 0.05 : 1}
            displayUnit={displayUnit}
            inDecimals={2}
            mmDecimals={1}
            ariaLabel="Lid split height"
            onChangeMm={(mm) => updateParam('lidHeightMm', mm)}
          />
        </Field>
      </div>

      <p className="helper-note">
        Shell outside {fmtDim(dims.outerW)} × {fmtDim(dims.outerD)} × {fmtDim(dims.baseH + dims.lidH)} {uLabel}
        {dims.hinge && `; knuckles add ${fmtDim(behind)} ${uLabel} behind`}
        {dims.clasp && `${dims.hinge ? ',' : ';'} clasp ${fmtDim(inFront)} ${uLabel} in front`}.
      </p>
      {dims.dropped.map((d) => (
        <p key={d} className="helper-note">
          {DROPPED_NOTES[d]}; it is left off.
        </p>
      ))}
    </>
  );
};
