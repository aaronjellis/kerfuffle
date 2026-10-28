import React from 'react';
import { computeMailerSpans } from '../../engine/mailerEngine';
import { Switch } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Mailer: the lid side flaps, and a read-out of the dust ears. */
export const FlapsSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model }) => {
  const { uLabel, fmtDim } = unitHelpers(displayUnit);
  const { innerDims } = model;
  const spans = computeMailerSpans(params, innerDims.widthMm, innerDims.depthMm, innerDims.heightMm);
  return (
    <>
      {params.cardboardLockStyle === 'fold-over' ? (
        <p className="helper-note">The fold-over closure uses lid ears in the side walls instead of lid side flaps.</p>
      ) : (
        <Switch
          label="Lid side flaps"
          checked={params.includeLidFlaps}
          onChange={(v) => updateParam('includeLidFlaps', v)}
        />
      )}
      <div className="dims-readout">
        <div>
          <span>Dust ears</span>
          <strong>
            {fmtDim(spans.earW)} {uLabel} wide
          </strong>
        </div>
      </div>
    </>
  );
};
