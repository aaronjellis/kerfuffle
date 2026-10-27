import React from 'react';
import { NumberField } from '../../components/NumberField';
import { MATERIAL_PRESETS, materialPresetFor } from '../../engine/presets';
import { Field } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Wood and cardboard only; the 3D box has no material part. */
export const MaterialSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, handlers }) => {
  const { isInch, uLabel } = unitHelpers(displayUnit);
  const { setParams } = handlers;
  return (
    <>
      <Field label="Material preset">
        <select
          value={params.materialPresetId ?? ''}
          onChange={(e) => {
            const mat = MATERIAL_PRESETS.find((m) => m.id === e.target.value);
            if (mat) {
              setParams((prev) => ({
                ...prev,
                materialPresetId: mat.id,
                materialThicknessMm: mat.thicknessMm,
                kerfMm: mat.kerfMm,
              }));
            }
          }}
        >
          <option value="" disabled>
            Choose a preset
          </option>
          {MATERIAL_PRESETS.filter((m) => m.category === params.category).map((mat) => (
            <option key={mat.id} value={mat.id}>
              {mat.name}, kerf {mat.kerfMm} mm
            </option>
          ))}
        </select>
      </Field>

      {(() => {
        const { preset, exact } = materialPresetFor(params);
        const laser = preset.laser;
        return (
          <>
            {exact && <p className="helper-note">{preset.scoreNote}</p>}
            <p className="helper-note">
              {!exact && `No preset for this thickness; using ${preset.name}: `}
              Cut {laser.cutPower}% at {laser.cutSpeed} mm/s, {laser.cutPasses}{' '}
              {laser.cutPasses === 1 ? 'pass' : 'passes'} · Score {laser.scorePower}% at{' '}
              {laser.scoreSpeed} mm/s
            </p>
          </>
        );
      })()}

      <div className="two-col-inputs">
        <Field label={`Thickness (${uLabel})`}>
          <NumberField
            valueMm={params.materialThicknessMm}
            minMm={0.2}
            // Cardboard spans go negative above about 10 mm on small boxes.
            maxMm={params.category === 'cardboard-fold' ? 8 : 15}
            step={isInch ? 0.005 : 0.1}
            displayUnit={displayUnit}
            inDecimals={3}
            mmDecimals={2}
            ariaLabel="Material thickness"
            onChangeMm={(mm) =>
              // NumberField commits on blur too; keep the preset unless the value actually changed.
              setParams((prev) =>
                prev.materialThicknessMm === mm
                  ? prev
                  : { ...prev, materialThicknessMm: mm, materialPresetId: undefined }
              )
            }
          />
        </Field>
        <Field label={`Laser kerf (${uLabel})`}>
          <NumberField
            valueMm={params.kerfMm}
            minMm={0}
            maxMm={1.0}
            step={isInch ? 0.001 : 0.02}
            displayUnit={displayUnit}
            inDecimals={4}
            mmDecimals={2}
            ariaLabel="Laser kerf"
            onChangeMm={(mm) => updateParam('kerfMm', mm)}
          />
        </Field>
      </div>

      {params.category === 'wood-finger' && handlers.openKerfTest && (
        <button type="button" className="btn btn-sm kerf-test-open" onClick={handlers.openKerfTest}>
          Find your kerf with a test cut
        </button>
      )}
    </>
  );
};
