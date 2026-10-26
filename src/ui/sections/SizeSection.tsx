import React from 'react';
import { NumberField } from '../../components/NumberField';
import { Segmented } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

export const SizeSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model, handlers }) => {
  const { isInch, uLabel, fmtDim } = unitHelpers(displayUnit);
  return (
    <>
      <div className="seg-pair">
        <Segmented
          ariaLabel="Units"
          value={displayUnit}
          onChange={handlers.setDisplayUnit}
          options={[
            { value: 'mm', label: 'mm' },
            { value: 'in', label: 'in' },
          ]}
        />
        <Segmented
          ariaLabel="Size measures"
          value={params.dimensionReference}
          onChange={(v) => updateParam('dimensionReference', v)}
          options={[
            { value: 'inner', label: 'Inner' },
            { value: 'outer', label: 'Outer' },
          ]}
        />
      </div>

      <div className="param-row">
        <div className="param-label-row">
          <label>Width ({uLabel})</label>
          <NumberField
            valueMm={params.widthMm}
            minMm={20}
            maxMm={500}
            step={isInch ? 0.1 : 1}
            displayUnit={displayUnit}
            inDecimals={2}
            mmDecimals={1}
            ariaLabel="Width"
            onChangeMm={(mm) => updateParam('widthMm', mm)}
          />
        </div>
        <input
          type="range"
          min={25}
          max={320}
          step={1}
          value={params.widthMm}
          aria-label="Width slider"
          onChange={(e) => updateParam('widthMm', Number(e.target.value))}
        />
      </div>

      <div className="param-row">
        <div className="param-label-row">
          <label>Depth ({uLabel})</label>
          <NumberField
            valueMm={params.depthMm}
            minMm={20}
            maxMm={500}
            step={isInch ? 0.1 : 1}
            displayUnit={displayUnit}
            inDecimals={2}
            mmDecimals={1}
            ariaLabel="Depth"
            onChangeMm={(mm) => updateParam('depthMm', mm)}
          />
        </div>
        <input
          type="range"
          min={25}
          max={320}
          step={1}
          value={params.depthMm}
          aria-label="Depth slider"
          onChange={(e) => updateParam('depthMm', Number(e.target.value))}
        />
      </div>

      <div className="param-row">
        <div className="param-label-row">
          <label>Height ({uLabel})</label>
          <NumberField
            valueMm={params.heightMm}
            minMm={15}
            maxMm={400}
            step={isInch ? 0.1 : 1}
            displayUnit={displayUnit}
            inDecimals={2}
            mmDecimals={1}
            ariaLabel="Height"
            onChangeMm={(mm) => updateParam('heightMm', mm)}
          />
        </div>
        <input
          type="range"
          min={18}
          max={240}
          step={1}
          value={params.heightMm}
          aria-label="Height slider"
          onChange={(e) => updateParam('heightMm', Number(e.target.value))}
        />
      </div>

      <div className="dims-readout">
        <div>
          <span>Inner</span>
          <strong>
            {fmtDim(model.innerDims.widthMm)} × {fmtDim(model.innerDims.depthMm)} ×{' '}
            {fmtDim(model.innerDims.heightMm)} {uLabel}
          </strong>
        </div>
        <div>
          <span>{params.category === '3d-print' ? 'Shell outside' : 'Outer'}</span>
          <strong>
            {fmtDim(model.outerDims.widthMm)} × {fmtDim(model.outerDims.depthMm)} ×{' '}
            {fmtDim(model.outerDims.heightMm)} {uLabel}
          </strong>
        </div>
      </div>
    </>
  );
};
