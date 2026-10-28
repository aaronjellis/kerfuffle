import React from 'react';
import { Printer } from 'lucide-react';
import { NumberField } from '../../components/NumberField';
import type { BoxParameters } from '../../engine/types';
import { Field, Switch } from '../Field';
import { computePrintBoxDims } from '../../engine/printParts';
import { withPrintedPinClamp } from '../paramRules';
import { runExport } from '../analytics';
import { DROPPED_NOTES, unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Clamshell: the rear seam's hinge. 3D box: the knuckle hinge and its filament pin. */
const PIN_LABEL: Record<BoxParameters['clamshellHingeType'], string> = {
  'butt-hardware': 'Pilot hole Ø',
  'printed-hinge': 'Filament pin Ø',
  'knuckle-pin': 'Pin Ø',
  'side-pivot': 'Pin Ø',
};

const HINGE_NOTE: Record<BoxParameters['clamshellHingeType'], string> = {
  'butt-hardware': 'Two small brass butt hinges screw onto the back, their barrels on the seam.',
  'printed-hinge': 'Two printed hinges press onto the back with printed pins; a filament pin runs through each knuckle.',
  'knuckle-pin':
    'Ten small round plates cut from the same sheet glue into slots on the back, five per hinge; a rod or filament pin runs through each set. The holes are 0.3 mm over the pin so it turns.',
  'side-pivot':
    'A plate glued outside each lid side hangs over the base, with one pin through both near the back. The base walls stop just short of the lid so it swings clear.',
};

export const HingeSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model, handlers }) => {
  const { isInch, uLabel } = unitHelpers(displayUnit);

  if (params.templateId === '3d-snap-box') {
    const { innerDims } = model;
    const dims = computePrintBoxDims(params, innerDims.widthMm, innerDims.depthMm, innerDims.heightMm);
    return (
      <>
        <Switch
          label="Rear knuckle hinge"
          checked={params.include3dHinge}
          onChange={(v) => updateParam('include3dHinge', v)}
        />
        {params.include3dHinge && (
          <>
            <Field label={`Filament pin Ø (${uLabel})`}>
              <NumberField
                valueMm={params.hingePinDiameterMm}
                minMm={1.0}
                maxMm={3.0}
                step={isInch ? 0.01 : 0.2}
                displayUnit={displayUnit}
                inDecimals={3}
                mmDecimals={2}
                ariaLabel="Filament pin diameter"
                onChangeMm={(mm) => updateParam('hingePinDiameterMm', mm)}
              />
            </Field>
            <p className="helper-note">Opens past 90°, not flat. Melt the pin ends to keep it in.</p>
            {dims.dropped.includes('hinge-height') && (
              <p className="helper-note">{DROPPED_NOTES['hinge-height']}; it is left off.</p>
            )}
          </>
        )}
      </>
    );
  }

  const printed = params.clamshellHingeType === 'printed-hinge';
  return (
    <>
      <Field label="Hinge type">
        <select
          value={params.clamshellHingeType}
          onChange={(e) => {
            const clamshellHingeType = e.target.value as BoxParameters['clamshellHingeType'];
            handlers.setParams((prev) => withPrintedPinClamp({ ...prev, clamshellHingeType }));
          }}
        >
          <option value="butt-hardware">Brass butt hinges on the back</option>
          <option value="printed-hinge">Printed hinges (STL)</option>
          <option value="knuckle-pin">Laser-cut knuckle plates and a pin</option>
          <option value="side-pivot">Side pivot plates and pins</option>
        </select>
      </Field>

      <Field label={`${PIN_LABEL[params.clamshellHingeType]} (${uLabel})`}>
        <NumberField
          valueMm={params.hingePinDiameterMm}
          minMm={1.0}
          maxMm={printed ? 3.0 : 6.0}
          step={isInch ? 0.01 : 0.2}
          displayUnit={displayUnit}
          inDecimals={3}
          mmDecimals={2}
          ariaLabel={PIN_LABEL[params.clamshellHingeType]}
          onChangeMm={(mm) => updateParam('hingePinDiameterMm', mm)}
        />
      </Field>
      <p className="helper-note">{HINGE_NOTE[params.clamshellHingeType]}</p>

      {params.clamshellHingeType === 'butt-hardware' && (
        <Switch
          label="Pilot screw holes for brass butt hinges"
          checked={params.includeHingeScrewHoles}
          onChange={(v) => updateParam('includeHingeScrewHoles', v)}
        />
      )}

      {printed && (
        <>
          <button
            type="button"
            className="btn"
            data-ph-capture-attribute-format="hinge-stl"
            onClick={() => void runExport('hinge-stl', params.templateId, handlers.exportHingeStl)}
          >
            <Printer size={18} strokeWidth={1.75} aria-hidden="true" />
            Export hinge STL
          </button>
          <p className="helper-note">Print two of these; a drop of glue holds each leaf.</p>
        </>
      )}
    </>
  );
};
