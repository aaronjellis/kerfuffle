import React from 'react';
import { NumberField } from '../../components/NumberField';
import type { BoxParameters } from '../../engine/types';
import { Field, Segmented } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/**
 * Cardboard: solid or perforated folds. The tuck carton and the telescope have no closure or flaps
 * parts, so their tuck flap, glue flap, carton style, lid height and slip clearance live here too.
 */
export const ScoreLinesSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit }) => {
  const { isInch, uLabel } = unitHelpers(displayUnit);
  return (
    <>
      <Segmented
        ariaLabel="Fold line mode"
        value={params.scoreLineMode}
        onChange={(v) => updateParam('scoreLineMode', v)}
        options={[
          { value: 'solid-score', label: 'Solid score', title: 'Continuous vector score (laser partial depth)' },
          { value: 'dashed-perf', label: 'Perforated', title: 'Perforated cut / bridge (corrugated fold)' },
        ]}
      />

      {params.scoreLineMode === 'dashed-perf' && (
        <div className="two-col-inputs">
          <Field label={`Perf cut (${uLabel})`}>
            <NumberField
              valueMm={params.perfCutMm}
              minMm={1}
              maxMm={15}
              step={isInch ? 0.02 : 0.5}
              displayUnit={displayUnit}
              inDecimals={3}
              mmDecimals={2}
              ariaLabel="Perforation cut length"
              onChangeMm={(mm) => updateParam('perfCutMm', mm)}
            />
          </Field>
          <Field label={`Perf bridge (${uLabel})`}>
            <NumberField
              valueMm={params.perfGapMm}
              minMm={0.8}
              maxMm={10}
              step={isInch ? 0.01 : 0.2}
              displayUnit={displayUnit}
              inDecimals={3}
              mmDecimals={2}
              ariaLabel="Perforation bridge length"
              onChangeMm={(mm) => updateParam('perfGapMm', mm)}
            />
          </Field>
        </div>
      )}

      {params.templateId === 'cardboard-tuck-carton' && (
        <>
          <div className="two-col-inputs">
            <Field label={`Tuck flap (${uLabel})`}>
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
            <Field label={`Glue flap (${uLabel})`}>
              <NumberField
                valueMm={params.glueFlapMm}
                minMm={8}
                maxMm={35}
                step={isInch ? 0.05 : 1}
                displayUnit={displayUnit}
                inDecimals={2}
                mmDecimals={1}
                ariaLabel="Glue flap width"
                onChangeMm={(mm) => updateParam('glueFlapMm', mm)}
              />
            </Field>
          </div>

          <Field label="Tuck ends">
            <select
              value={params.tuckCartonStyle}
              onChange={(e) => updateParam('tuckCartonStyle', e.target.value as BoxParameters['tuckCartonStyle'])}
            >
              <option value="reverse-tuck">Reverse tuck end (RTE)</option>
              <option value="straight-tuck">Straight tuck end (STE)</option>
            </select>
          </Field>
        </>
      )}

      {params.templateId === 'cardboard-telescope' && (
        <div className="two-col-inputs">
          <Field label={`Lid height (${uLabel})`}>
            <NumberField
              valueMm={params.lidHeightMm}
              minMm={15}
              maxMm={params.heightMm}
              step={isInch ? 0.05 : 1}
              displayUnit={displayUnit}
              inDecimals={2}
              mmDecimals={1}
              ariaLabel="Lid height"
              onChangeMm={(mm) => updateParam('lidHeightMm', mm)}
            />
          </Field>
          <Field label={`Slip clearance (${uLabel})`}>
            <NumberField
              valueMm={params.telescopeClearanceMm}
              minMm={0.4}
              maxMm={4.0}
              step={isInch ? 0.01 : 0.2}
              displayUnit={displayUnit}
              inDecimals={3}
              mmDecimals={2}
              ariaLabel="Telescope clearance"
              onChangeMm={(mm) => updateParam('telescopeClearanceMm', mm)}
            />
          </Field>
        </div>
      )}
    </>
  );
};
