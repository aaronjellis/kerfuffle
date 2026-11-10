import React from 'react';
import { NumberField } from '../../components/NumberField';
import { resolveDividerThickness, resolveDividers } from '../../engine/printDividers';
import { computePrintBoxDims, resolveDividerHeight } from '../../engine/printParts';
import { Field } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** 3D box: the freeform dividers' shared thickness and height, and how many there are. */
export const PrintDividersSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model, handlers }) => {
  const { isInch, uLabel } = unitHelpers(displayUnit);
  const { innerDims } = model;
  const dims = computePrintBoxDims(params, innerDims.widthMm, innerDims.depthMm, innerDims.heightMm);
  const { layout, hidden } = resolveDividers(params, dims.innerW, dims.innerD, dims.rIn);
  const maxHeight = dims.baseH - dims.floor;
  const count = layout.length;
  return (
    <>
      <div className="two-col-inputs">
        <Field label={`Divider thickness (${uLabel})`}>
          <NumberField
            valueMm={resolveDividerThickness(params)}
            minMm={0.8}
            maxMm={8.0}
            step={isInch ? 0.01 : 0.4}
            displayUnit={displayUnit}
            inDecimals={3}
            mmDecimals={2}
            ariaLabel="Divider thickness"
            onChangeMm={(mm) => updateParam('dividerThickness3dMm', mm)}
          />
        </Field>
        <Field label={`Divider height (${uLabel})`}>
          <NumberField
            valueMm={resolveDividerHeight(params, dims)}
            minMm={Math.min(2, maxHeight)}
            maxMm={maxHeight}
            step={isInch ? 0.05 : 1}
            displayUnit={displayUnit}
            inDecimals={2}
            mmDecimals={1}
            ariaLabel="Divider height"
            onChangeMm={(mm) => updateParam('dividerHeight3dMm', mm >= maxHeight - 1e-6 ? 0 : mm)}
          />
        </Field>
      </div>
      {params.dividerThickness3dMm > 0 && (
        <button type="button" className="link-btn" onClick={() => updateParam('dividerThickness3dMm', 0)}>
          Match wall thickness
        </button>
      )}

      <p className="helper-note">
        {count === 0 && hidden === 0
          ? 'No dividers yet. Pick Divider on the preview, then click inside the box.'
          : `${count} ${count === 1 ? 'divider' : 'dividers'}. They print as part of the base, up to its rim.`}
      </p>
      {hidden > 0 && (
        <p className="helper-note">
          <strong>{`${hidden} hidden:`}</strong>{' '}
          {hidden === 1
            ? 'it doesn’t fit at this size, and comes back when it does. Changing the dividers now removes it for good.'
            : 'they don’t fit at this size, and come back when they do. Changing the dividers now removes them for good.'}
        </p>
      )}
      {params.printDividers.length > 0 && (
        <button
          type="button"
          className="link-btn link-btn-danger"
          onClick={() => handlers.setParams((p) => ({ ...p, printDividers: [] }))}
        >
          Remove all
        </button>
      )}
    </>
  );
};
