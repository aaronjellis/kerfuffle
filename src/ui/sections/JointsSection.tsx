import React from 'react';
import { NumberField } from '../../components/NumberField';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Wood: finger size. Kerf lives in Material. */
export const JointsSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model }) => {
  const { isInch, uLabel } = unitHelpers(displayUnit);
  return (
    <>
      <div className="param-row">
        <div className="param-label-row">
          <label>Finger size ({uLabel})</label>
          <NumberField
            valueMm={params.fingerWidthMm}
            minMm={4}
            maxMm={50}
            step={isInch ? 0.05 : 1}
            displayUnit={displayUnit}
            inDecimals={2}
            mmDecimals={1}
            ariaLabel="Target finger size"
            onChangeMm={(mm) => updateParam('fingerWidthMm', mm)}
          />
        </div>
        <input
          type="range"
          min={5}
          max={35}
          step={1}
          value={params.fingerWidthMm}
          aria-label="Target finger size slider"
          onChange={(e) => updateParam('fingerWidthMm', Number(e.target.value))}
        />
      </div>

      <p className="helper-note">{model.stats.fingerCountSummary}</p>
    </>
  );
};
