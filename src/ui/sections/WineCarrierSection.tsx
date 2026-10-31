import React from 'react';
import { NumberField } from '../../components/NumberField';
import { WINE_BOTTLES, bottlePatch, wineCarrierChecks, wineCarrierLayout } from '../../engine/wineBottles';
import { Field, Segmented, Switch } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Wine carrier: the bottle it's sized from, the room round it, the shoulders and the feet. */
export const WineCarrierSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, handlers }) => {
  const { isInch, uLabel, fmtDim } = unitHelpers(displayUnit);
  const custom = params.wineBottleId === 'custom';
  const layout = wineCarrierLayout(params);
  const checks = wineCarrierChecks(params);
  const length = (key: 'wineBottleDiameterMm' | 'wineBottleHeightMm' | 'wineBottleShoulderMm' | 'wineClearanceMm', label: string, min: number, max: number) => (
    <Field label={`${label} (${uLabel})`}>
      <NumberField
        valueMm={params[key]}
        minMm={min}
        maxMm={max}
        step={isInch ? 0.05 : 1}
        displayUnit={displayUnit}
        inDecimals={2}
        mmDecimals={1}
        ariaLabel={label}
        // Typing a size makes the bottle a custom one.
        onChangeMm={(mm) => handlers.setParams((prev) => ({ ...prev, [key]: mm, ...(key === 'wineClearanceMm' ? {} : { wineBottleId: 'custom' }) }))}
      />
    </Field>
  );
  return (
    <>
      <Segmented
        ariaLabel="Units"
        value={displayUnit}
        onChange={handlers.setDisplayUnit}
        options={[
          { value: 'mm', label: 'mm' },
          { value: 'in', label: 'in' },
        ]}
      />
      <Field label="Bottle">
        <select value={WINE_BOTTLES.some((b) => b.id === params.wineBottleId) ? params.wineBottleId : 'custom'} onChange={(e) => handlers.setParams((prev) => ({ ...prev, ...bottlePatch(e.target.value) }))}>
          {WINE_BOTTLES.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </Field>
      <div className="two-col-inputs">
        {length('wineBottleDiameterMm', 'Diameter', 40, 160)}
        {length('wineBottleHeightMm', 'Height', 120, 500)}
      </div>
      <div className="two-col-inputs">
        {length('wineBottleShoulderMm', 'Shoulder starts at', 60, 400)}
        {length('wineClearanceMm', 'Clearance', 0, 20)}
      </div>
      {!custom && <p className="helper-note">Measure your bottle and change any size to make it a custom one.</p>}
      <Field label={`Shoulder height (${uLabel})`}>
        <NumberField
          valueMm={params.wineShoulderHeightMm > 0 ? params.wineShoulderHeightMm : layout.shoulderHeightMm}
          minMm={layout.minShoulderHeightMm}
          maxMm={300}
          step={isInch ? 0.05 : 1}
          displayUnit={displayUnit}
          inDecimals={2}
          mmDecimals={0}
          ariaLabel="Shoulder height"
          onChangeMm={(mm) => updateParam('wineShoulderHeightMm', mm)}
        />
      </Field>
      <p className="helper-note">
        {params.wineShoulderHeightMm > 0 ? (
          <button type="button" className="btn btn-sm" onClick={() => updateParam('wineShoulderHeightMm', 0)}>
            Size the shoulders to the bottle
          </button>
        ) : (
          `Sized to clear the bottle's neck: at least ${fmtDim(layout.minShoulderHeightMm)} ${uLabel}. Taller shoulders slope more gently.`
        )}
      </p>
      <Switch label="Arched feet" checked={params.wineFeet} onChange={(v) => updateParam('wineFeet', v)} />
      <p className="helper-note">
        Inside {fmtDim(layout.innerSideMm)} × {fmtDim(layout.innerSideMm)} {uLabel}, {fmtDim(layout.bodyHeightMm + layout.shoulderHeightMm + layout.handleHeightMm)} {uLabel} tall to the handle.
        The handle&rsquo;s hooked tabs lock into the ears when you carry it; press the handle down and flex the ears out to open.
      </p>
      {checks.notes.map((n) => (
        <p key={n} className="helper-note hinge-web-warning">
          {n}
        </p>
      ))}
    </>
  );
};
