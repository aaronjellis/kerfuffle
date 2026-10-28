import React from 'react';
import { NumberField } from '../../components/NumberField';
import { computeMailerSpans } from '../../engine/mailerEngine';
import { Field, Segmented, Switch } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/**
 * Mailer: how the lid closes. Tuck top (with an optional thumb notch), front lock tabs, or fold over:
 * the front flap folds down outside the front wall and the lid's ears drop into the side rolls.
 */
export const ClosureSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model }) => {
  const { isInch, uLabel, fmtDim } = unitHelpers(displayUnit);
  const { innerDims } = model;
  const spans = computeMailerSpans(params, innerDims.widthMm, innerDims.depthMm, innerDims.heightMm);
  return (
    <>
      <Segmented
        ariaLabel="Lid closure"
        value={params.cardboardLockStyle}
        onChange={(v) => updateParam('cardboardLockStyle', v)}
        options={[
          { value: 'tuck', label: 'Tuck top' },
          { value: 'front-lock', label: 'Front lock' },
          { value: 'fold-over', label: 'Fold over' },
        ]}
      />

      {params.cardboardLockStyle === 'fold-over' && (
        <p className="helper-note">
          The front flap folds down over the outside of the front wall, and two ears on the lid drop through
          slots in the side walls' top folds. The dust flaps shrink to make room for the ears.
        </p>
      )}

      {params.cardboardLockStyle === 'tuck' && (
        <Switch label="Thumb notch" checked={params.thumbNotch} onChange={(v) => updateParam('thumbNotch', v)} />
      )}

      {params.cardboardLockStyle === 'front-lock' && (
        <div className="two-col-inputs">
          <Field label={`Lock tab width (${uLabel})`}>
            <NumberField
              valueMm={params.lockTabWidthMm}
              minMm={8}
              maxMm={60}
              step={isInch ? 0.05 : 1}
              displayUnit={displayUnit}
              inDecimals={2}
              mmDecimals={1}
              ariaLabel="Lock tab width"
              onChangeMm={(mm) => updateParam('lockTabWidthMm', mm)}
            />
          </Field>
          <Field label={`Lock tab depth (${uLabel})`}>
            <NumberField
              valueMm={params.lockTabDepthMm}
              minMm={5}
              maxMm={45}
              step={isInch ? 0.05 : 1}
              displayUnit={displayUnit}
              inDecimals={2}
              mmDecimals={1}
              ariaLabel="Lock tab depth"
              onChangeMm={(mm) => updateParam('lockTabDepthMm', mm)}
            />
          </Field>
        </div>
      )}

      <Field label={`${params.cardboardLockStyle === 'fold-over' ? 'Front flap' : 'Tuck flap'} height (${uLabel})`}>
        <NumberField
          valueMm={params.tuckFlapMm}
          minMm={10}
          maxMm={45}
          step={isInch ? 0.05 : 1}
          displayUnit={displayUnit}
          inDecimals={2}
          mmDecimals={1}
          ariaLabel="Tuck flap length"
          onChangeMm={(mm) => updateParam('tuckFlapMm', mm)}
        />
      </Field>

      {spans.lock && (
        <div className="dims-readout">
          <div>
            <span>Lock ears</span>
            <strong>
              {fmtDim(spans.lock.tabW)} × {fmtDim(spans.lock.tabLen)} {uLabel}
            </strong>
          </div>
        </div>
      )}
      {spans.lockNote && <p className="helper-note">Cut as a tuck top: {spans.lockNote}.</p>}
      {spans.foldOver && (
        <div className="dims-readout">
          <div>
            <span>Lid ears</span>
            <strong>
              {spans.lidEar ? `${fmtDim(spans.lidEar.len)} × ${fmtDim(spans.lidEar.depth)} ${uLabel}` : 'none: box too shallow'}
            </strong>
          </div>
          <div>
            <span>Front flap</span>
            <strong>
              {fmtDim(spans.tuckW)} × {fmtDim(spans.tuckH)} {uLabel}
            </strong>
          </div>
        </div>
      )}
    </>
  );
};
