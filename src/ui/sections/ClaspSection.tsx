import React from 'react';
import { NumberField } from '../../components/NumberField';
import { MAGNET_DIAMETER_RANGE_MM, MAGNET_THICKNESS_RANGE_MM, computePrintBoxDims } from '../../engine/printParts';
import { Field, Switch } from '../Field';
import { DROPPED_NOTES, unitHelpers } from './shared';
import type { SectionProps } from './types';

/** 3D box: the front snap clasp, and magnet pockets. */
export const ClaspSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model }) => {
  const { isInch, uLabel, fmtDim } = unitHelpers(displayUnit);
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
      {params.include3dMagnets && (
        <>
          <div className="two-col-inputs">
            <Field label={`Magnet diameter (${uLabel})`}>
              <NumberField
                valueMm={params.magnet3dDiameterMm}
                minMm={MAGNET_DIAMETER_RANGE_MM[0]}
                maxMm={MAGNET_DIAMETER_RANGE_MM[1]}
                step={isInch ? 0.01 : 0.5}
                displayUnit={displayUnit}
                inDecimals={3}
                mmDecimals={1}
                ariaLabel="Magnet diameter"
                onChangeMm={(mm) => updateParam('magnet3dDiameterMm', mm)}
              />
            </Field>
            <Field label={`Magnet thickness (${uLabel})`}>
              <NumberField
                valueMm={params.magnet3dThicknessMm}
                minMm={MAGNET_THICKNESS_RANGE_MM[0]}
                maxMm={MAGNET_THICKNESS_RANGE_MM[1]}
                step={isInch ? 0.01 : 0.5}
                displayUnit={displayUnit}
                inDecimals={3}
                mmDecimals={1}
                ariaLabel="Magnet thickness"
                onChangeMm={(mm) => updateParam('magnet3dThicknessMm', mm)}
              />
            </Field>
          </div>
          {dims.magnets ? (
            <p className="helper-note">
              A column in each front corner of the base and lid, joined to both walls, with a pocket{' '}
              {fmtDim(dims.magnets.pocketD)} × {fmtDim(dims.magnets.pocketDepth)} {uLabel}: 0.2 mm over the magnet so it
              drops in. Glue the magnets in, and check each pair attracts before the glue sets.
            </p>
          ) : (
            <p className="helper-note">{DROPPED_NOTES['magnet-room']}; they are left off.</p>
          )}
        </>
      )}
    </>
  );
};
