import React from 'react';
import { computeMailerSpans } from '../../engine/mailerEngine';
import { Switch } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Mailer: the lid side flaps, and a read-out of the parts that have no settings of their own. */
export const FlapsSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model }) => {
  const { uLabel, fmtDim } = unitHelpers(displayUnit);
  const { innerDims } = model;
  const spans = computeMailerSpans(params, innerDims.widthMm, innerDims.depthMm, innerDims.heightMm);
  return (
    <>
      <Switch
        label="Lid side flaps"
        checked={params.includeLidFlaps}
        onChange={(v) => updateParam('includeLidFlaps', v)}
      />
      <div className="dims-readout">
        <div>
          <span>Dust ears</span>
          <strong>
            {fmtDim(spans.earW)} {uLabel} wide
          </strong>
        </div>
        <div>
          <span>Floor tabs</span>
          <strong>
            {spans.tab.centers.length} × {fmtDim(spans.tab.len)} × {fmtDim(spans.tab.depth)} {uLabel}
          </strong>
        </div>
        <div>
          <span>Slots</span>
          <strong>
            {fmtDim(spans.slot.len)} × {fmtDim(spans.slot.width)} {uLabel}
          </strong>
        </div>
      </div>
    </>
  );
};
