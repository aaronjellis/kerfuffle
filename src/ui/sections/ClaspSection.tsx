import React from 'react';
import { computePrintBoxDims } from '../../engine/printParts';
import { Switch } from '../Field';
import { DROPPED_NOTES, unitHelpers } from './shared';
import type { SectionProps } from './types';

/** 3D box: the front snap clasp, and magnet pockets. */
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
          <p className="helper-note">
            The hook and its ridge print as 45° slopes with no supports. The tongue's stiffness holds the lid
            shut: pull the thumb lip out to open it. Print the lid in PETG if you can, because the tongue bends
            across its layer lines.
          </p>
        </>
      )}
      <Switch
        label="Magnet pockets"
        checked={params.include3dMagnets}
        onChange={(v) => updateParam('include3dMagnets', v)}
      />
      {params.include3dMagnets &&
        (dims.magnets ? (
          <p className="helper-note">
            A column in each front corner of the base and lid, with a pocket for a 6 × 3 mm disc magnet. Glue the
            magnets in, and check each pair attracts before the glue sets.
          </p>
        ) : (
          <p className="helper-note">{DROPPED_NOTES['magnet-room']}; they are left off.</p>
        ))}
    </>
  );
};
