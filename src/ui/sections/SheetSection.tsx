import React from 'react';
import { EXPORT_PROFILES, MACHINE_BED_PRESETS } from '../../engine/presets';
import type { BoxParameters, ExportProfileId } from '../../engine/types';
import { NumberField } from '../../components/NumberField';
import { Field, Switch } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Laser and cardboard: the machine bed, nesting gaps, and how the SVG is written. */
export const SheetSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model, handlers }) => {
  const { isInch, uLabel, fmtDim } = unitHelpers(displayUnit);
  const activeProfile = EXPORT_PROFILES[params.exportProfile];
  return (
    <>
      <Field label="Bed size">
        <select value={params.bedPresetId} onChange={(e) => updateParam('bedPresetId', e.target.value)}>
          {MACHINE_BED_PRESETS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="two-col-inputs">
        <Field label={`Part gap (${uLabel})`}>
          <NumberField
            valueMm={params.partSpacingMm}
            minMm={1}
            maxMm={25}
            step={isInch ? 0.05 : 1}
            displayUnit={displayUnit}
            inDecimals={2}
            mmDecimals={1}
            ariaLabel="Part gap"
            onChangeMm={(mm) => updateParam('partSpacingMm', mm)}
          />
        </Field>
        <Field label={`Margin (${uLabel})`}>
          <NumberField
            valueMm={params.sheetMarginMm}
            minMm={2}
            maxMm={30}
            step={isInch ? 0.05 : 1}
            displayUnit={displayUnit}
            inDecimals={2}
            mmDecimals={1}
            ariaLabel="Sheet margin"
            onChangeMm={(mm) => updateParam('sheetMarginMm', mm)}
          />
        </Field>
      </div>

      {params.category === 'wood-finger' && (
        <>
          <Switch
            label="Cut shared edges once"
            checked={params.shareCutLines}
            onChange={(v) => updateParam('shareCutLines', v)}
          />
          <p className="helper-note">
            {params.shareCutLines
              ? model.stats.sharedCutMm > 0
                ? `Pieces sit edge to edge and ${(model.stats.sharedCutMm / 1000).toFixed(2)} m of shared edge is cut once, about ${Math.round((100 * model.stats.sharedCutMm) / (model.stats.totalCutLengthMm + model.stats.sharedCutMm))}% less cutting. `
                : 'Pieces sit edge to edge, but none share a straight edge in this layout. '
              : 'Packs pieces edge to edge and cuts each shared straight edge once. '}
            A piece that shares an edge loses it from its own outline: it still cuts out whole, but in your laser
            software it won't move as one closed shape.
          </p>
        </>
      )}

      <Field label="Export profile">
        <select
          value={params.exportProfile}
          onChange={(e) => handlers.selectProfile(e.target.value as ExportProfileId)}
        >
          {Object.values(EXPORT_PROFILES).map((prof) => (
            <option key={prof.id} value={prof.id}>
              {prof.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="SVG units">
        <select
          value={params.svgUnitMode}
          onChange={(e) => updateParam('svgUnitMode', e.target.value as BoxParameters['svgUnitMode'])}
        >
          <option value="mm">Millimeters, 1:1 (xTool Studio, LightBurn)</option>
          <option value="in">Inches, 1:1 (imperial CAD)</option>
          <option value="96dpi">CSS pixels, 96 DPI (Inkscape, web)</option>
          <option value="72dpi">Points, 72 DPI (older Illustrator)</option>
        </select>
      </Field>

      <Field label="SVG grouping">
        <select
          value={params.svgGroupingMode || 'by-layer'}
          onChange={(e) => updateParam('svgGroupingMode', e.target.value as BoxParameters['svgGroupingMode'])}
        >
          <option value="flat-2-objects">Flat: one score object and one cut object</option>
          <option value="by-piece">By piece: cut and score grouped per piece</option>
          <option value="by-layer">By layer: a score group and a cut group</option>
        </select>
      </Field>

      <Switch
        label="Sheet frame and 50 mm scale bar"
        checked={params.includeScaleBar}
        onChange={(v) => updateParam('includeScaleBar', v)}
      />
      <Switch
        label="Registration marks for print-then-cut"
        checked={params.includeRegistrationMarks}
        onChange={(v) => updateParam('includeRegistrationMarks', v)}
      />
      <Switch
        label="Panel dimensions on the 2D sheet"
        checked={params.showDimensions}
        onChange={(v) => updateParam('showDimensions', v)}
      />

      <div className="dims-readout">
        <div>
          <span>Import size</span>
          <strong>
            {fmtDim(model.sheetWidthMm)} × {fmtDim(model.sheetHeightMm)} {uLabel}
          </strong>
        </div>
      </div>

      <div className="profile-info-box">
        <strong>{activeProfile.badge}</strong>
        <p>{activeProfile.notes}</p>
        {params.exportProfile === 'xtool-studio' && (
          <p>
            In xTool Studio's layer list, set the {activeProfile.scoreColor} swatch to <strong>Score</strong> and the{' '}
            {activeProfile.cutColor} swatch to <strong>Cut</strong>. No ungrouping needed.
          </p>
        )}
      </div>
    </>
  );
};
