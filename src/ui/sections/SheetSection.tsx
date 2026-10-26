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
      <Field label="Laser / cutter bed size">
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
            ariaLabel="Part Gap"
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
            ariaLabel="Sheet Margin"
            onChangeMm={(mm) => updateParam('sheetMarginMm', mm)}
          />
        </Field>
      </div>

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

      <Field label="SVG scale / unit coordinate system">
        <select
          value={params.svgUnitMode}
          onChange={(e) => updateParam('svgUnitMode', e.target.value as BoxParameters['svgUnitMode'])}
        >
          <option value="mm">1:1 Millimeters (xTool Studio / LightBurn Default)</option>
          <option value="in">1:1 Inches (width="...in" / Imperial CAD)</option>
          <option value="96dpi">96 DPI CSS Pixels (Inkscape / Web SVG)</option>
          <option value="72dpi">72 DPI Points (Illustrator Legacy)</option>
        </select>
      </Field>

      <Field label="SVG grouping structure">
        <select
          value={params.svgGroupingMode || 'by-layer'}
          onChange={(e) => updateParam('svgGroupingMode', e.target.value as BoxParameters['svgGroupingMode'])}
        >
          <option value="flat-2-objects">
            xTool Flat (1 Joined Score + 1 Joined Cut Object — 1 Ungroup separates them)
          </option>
          <option value="by-piece">Group by Piece (Locked Cut + Score per Box Piece)</option>
          <option value="by-layer">Group by Layer (Score_Lines Group + Cut_Lines Group)</option>
        </select>
      </Field>

      <Switch
        label="Embed sheet frame and 50 mm scale bar"
        checked={params.includeScaleBar}
        onChange={(v) => updateParam('includeScaleBar', v)}
      />
      <Switch
        label="Print-then-cut corner registration marks"
        checked={params.includeRegistrationMarks}
        onChange={(v) => updateParam('includeRegistrationMarks', v)}
      />
      <Switch
        label="Show panel dimensions on 2D sheet"
        checked={params.showDimensions}
        onChange={(v) => updateParam('showDimensions', v)}
      />

      <div className="dims-readout">
        <div>
          <span>Target import size:</span>
          <strong>
            {fmtDim(model.sheetWidthMm)} × {fmtDim(model.sheetHeightMm)} {uLabel}
          </strong>
        </div>
      </div>

      <div className="profile-info-box">
        <strong>{activeProfile.badge}</strong>
        <p>{activeProfile.notes}</p>
        <p style={{ marginTop: 4, color: 'var(--accent-hover)', fontSize: 10.5 }}>
          💡 <strong>xTool Studio Pro Tip:</strong> Look at the <em>Layer list</em> at the bottom-left of xTool Studio:
          click the <strong>Blue (#0000FF)</strong> swatch → set to <strong>Score</strong>, and the{' '}
          <strong>Red (#FF0000)</strong> swatch → set to <strong>Cut</strong>. No ungrouping needed! Or click{' '}
          <strong>Split (Cut+Score)</strong> above for 2 separate files.
        </p>
      </div>
    </>
  );
};
