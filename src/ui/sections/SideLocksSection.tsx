import React from 'react';
import { NumberField } from '../../components/NumberField';
import { computeMailerSpans } from '../../engine/mailerEngine';
import { Field, Segmented } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Mailer: the inner side walls' tabs that lock into the floor slots. */
export const SideLocksSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model }) => {
  const { isInch, uLabel, fmtDim } = unitHelpers(displayUnit);
  const { innerDims } = model;
  const spans = computeMailerSpans(params, innerDims.widthMm, innerDims.depthMm, innerDims.heightMm);
  const count = spans.tab.centers.length;
  return (
    <>
      <Field label="Tabs per side" group>
        <Segmented
          ariaLabel="Tabs per side"
          value={String(params.sideTabCount) as '1' | '2'}
          onChange={(v) => updateParam('sideTabCount', v === '1' ? 1 : 2)}
          options={[
            { value: '1', label: 'One' },
            { value: '2', label: 'Two' },
          ]}
        />
      </Field>

      <Field label={`Tab length (${uLabel})`}>
        <NumberField
          valueMm={params.sideTabLenMm}
          minMm={6}
          maxMm={40}
          step={isInch ? 0.05 : 1}
          displayUnit={displayUnit}
          inDecimals={2}
          mmDecimals={1}
          ariaLabel="Side tab length"
          onChangeMm={(mm) => updateParam('sideTabLenMm', mm)}
        />
      </Field>

      <div className="dims-readout">
        <div>
          <span>Tabs</span>
          <strong>
            {count} × {fmtDim(spans.tab.len)} × {fmtDim(spans.tab.depth)} {uLabel}
          </strong>
        </div>
        <div>
          <span>Slots</span>
          <strong>
            {fmtDim(spans.slot.len)} × {fmtDim(spans.slot.width)} {uLabel}
          </strong>
        </div>
      </div>
      {params.sideTabCount === 2 && count === 1 && (
        <p className="helper-note">One tab per side: the wall is too short for two.</p>
      )}
    </>
  );
};
