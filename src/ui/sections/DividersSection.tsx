import React from 'react';
import { NumberField } from '../../components/NumberField';
import { Field } from '../Field';
import type { SectionProps } from './types';

/** Organizer: the divider grid. */
export const DividersSection: React.FC<SectionProps> = ({ params, updateParam }) => (
  <div className="two-col-inputs">
    <Field label="Columns (X)">
      <NumberField
        valueMm={params.dividerCols}
        minMm={1}
        maxMm={6}
        step={1}
        isRawCount
        ariaLabel="Divider Columns"
        onChangeMm={(n) => updateParam('dividerCols', n)}
      />
    </Field>
    <Field label="Rows (Y)">
      <NumberField
        valueMm={params.dividerRows}
        minMm={1}
        maxMm={6}
        step={1}
        isRawCount
        ariaLabel="Divider Rows"
        onChangeMm={(n) => updateParam('dividerRows', n)}
      />
    </Field>
  </div>
);
