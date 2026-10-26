import React from 'react';
import { computePrintBoxDims } from '../../engine/printParts';
import { Switch } from '../Field';
import { DROPPED_NOTES, unitHelpers } from './shared';
import type { SectionProps } from './types';

/** 3D box: the front snap clasp. */
export const ClaspSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model }) => {
  const { uLabel, fmtDim } = unitHelpers(displayUnit);
  const { innerDims } = model;
  const dims = computePrintBoxDims(params, innerDims.widthMm, innerDims.depthMm, innerDims.heightMm);
  return (
    <>
      <Switch
        label="Front snap clasp"
        checked={params.includeSnapClasp}
        onChange={(v) => updateParam('includeSnapClasp', v)}
      />
      {params.includeSnapClasp && (
        <>
          {dims.clasp && (
            <div className="dims-readout">
              <div>
                <span>Clasp width</span>
                <strong>
                  {fmtDim(dims.clasp.width)} {uLabel}
                </strong>
              </div>
            </div>
          )}
          {dims.dropped
            .filter((d) => d.startsWith('clasp'))
            .map((d) => (
              <p key={d} className="helper-note">
                {DROPPED_NOTES[d]}; it is left off.
              </p>
            ))}
          <p className="helper-note">Print the lid in PETG; the tongue bends across layer lines.</p>
        </>
      )}
    </>
  );
};
