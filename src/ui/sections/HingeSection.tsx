import React from 'react';
import { Printer } from 'lucide-react';
import { NumberField } from '../../components/NumberField';
import type { BoxParameters } from '../../engine/types';
import { Field, Switch } from '../Field';
import { computePrintBoxDims } from '../../engine/printParts';
import { DROPPED_NOTES, unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Clamshell: the rear seam's hinge. 3D box: the knuckle hinge and its filament pin. */
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
      <Field label="Rear hinge seam joinery">
        <select
          value={params.clamshellHingeType}
          onChange={(e) =>
            updateParam('clamshellHingeType', e.target.value as BoxParameters['clamshellHingeType'])
          }
        >
          <option value="butt-hardware">Flat Butt Seam (No Fingers — Add Hardware Hinge)</option>
          <option value="side-pivot">Flat Rear Seam + Side-Wall Pivot Pin Holes</option>
          <option value="knuckle-pin">Interlocking Finger Seam (Custom Hinge Fingers)</option>
          <option value="printed-hinge">Printed hinge (STL)</option>
        </select>
      </Field>

      {params.clamshellHingeType === 'knuckle-pin' ? (
        <Field label={`Hinge finger (${uLabel})`}>
          <NumberField
            valueMm={params.hingeFingerWidthMm}
            minMm={4}
            maxMm={40}
            step={isInch ? 0.05 : 1}
            displayUnit={displayUnit}
            inDecimals={2}
            mmDecimals={1}
            ariaLabel="Hinge Finger Width"
            onChangeMm={(mm) => updateParam('hingeFingerWidthMm', mm)}
          />
        </Field>
      ) : (
        <Field label={`${printed ? 'Filament pin Ø' : 'Hole Ø'} (${uLabel})`}>
          <NumberField
            valueMm={params.hingePinDiameterMm}
            minMm={1.0}
            maxMm={printed ? 3.0 : 6.0}
            step={isInch ? 0.01 : 0.2}
            displayUnit={displayUnit}
            inDecimals={3}
            mmDecimals={2}
            ariaLabel={printed ? 'Filament pin diameter' : 'Hinge Hole Diameter'}
            onChangeMm={(mm) => updateParam('hingePinDiameterMm', mm)}
          />
        </Field>
      )}

      {params.clamshellHingeType === 'butt-hardware' && (
        <Switch
          label="Pilot screw holes for brass butt hinges"
          checked={params.includeHingeScrewHoles}
          onChange={(v) => updateParam('includeHingeScrewHoles', v)}
        />
      )}

      {printed && (
        <>
          <button type="button" className="export-btn export-btn-3d" onClick={handlers.exportHingeStl}>
            <Printer size={14} />
            Export hinge STL
          </button>
          <p className="helper-note">Print two of these; a drop of glue holds each leaf.</p>
        </>
      )}
    </>
  );
};
