import React, { useId } from 'react';
import { NumberField } from '../../components/NumberField';
import {
  HINGE_PATTERNS,
  MIN_HINGE_BRIDGE_MM,
  MIN_HINGE_CUT_MM,
  MIN_SAFE_WEB_MM,
  hingeCuts,
  hingeMinWebMm,
  hingePatternInfo,
  hingeShapePath,
  type HingePatternId,
} from '../../engine/livingHinge';
import { livingHingeSettings } from '../../engine/fingerJointEngine';
import type { BoxParameters } from '../../engine/types';
import { Field } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

const PREVIEW_W = 56;
const PREVIEW_H = 40;

/** One small swatch per pattern at its default settings, drawn once at 1 mm to the unit. */
const PREVIEWS: Record<string, string> = Object.fromEntries(
  HINGE_PATTERNS.map((p) => [
    p.id,
    hingeCuts({ pattern: p.id, ...p.defaults }, { x: 0, y: 0, width: PREVIEW_W, height: PREVIEW_H })
      .map(hingeShapePath)
      .join(' '),
  ]),
);

export const HingePatternPreview: React.FC<{ pattern: HingePatternId; className?: string }> = ({ pattern, className }) => (
  <svg viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`} className={className} aria-hidden="true">
    <rect className="hinge-swatch-sheet" x="0" y="0" width={PREVIEW_W} height={PREVIEW_H} rx="2" />
    <path className="hinge-swatch-cuts" d={PREVIEWS[pattern]} />
  </svg>
);

/** Living-hinge box: the kerf pattern and its sizes, and how the flex panel attaches. */
export const LivingHingeSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, handlers }) => {
  const { isInch, uLabel } = unitHelpers(displayUnit);
  const pitchId = useId();
  const info = hingePatternInfo(params.livingHingePattern);
  const web = hingeMinWebMm(livingHingeSettings(params), params.kerfMm);
  const [pitchMin, pitchMax] = info.pitchRangeMm;

  /** A new pattern starts from its own sizes: a lattice's cells are much bigger than a slit row. */
  const pickPattern = (id: HingePatternId) => {
    const d = hingePatternInfo(id).defaults;
    handlers.setParams((prev) => ({
      ...prev,
      livingHingePattern: id,
      livingHingePitchMm: d.pitchMm,
      livingHingeCutMm: d.cutMm,
      livingHingeBridgeMm: d.bridgeMm,
    }));
  };

  return (
    <>
      <div className="pattern-picker hinge-picker" role="radiogroup" aria-label="Kerf pattern">
        {HINGE_PATTERNS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={params.livingHingePattern === p.id}
            aria-label={p.name}
            className="pattern-tile"
            data-ph-capture-attribute-hinge-pattern={p.id}
            onClick={() => pickPattern(p.id)}
          >
            <HingePatternPreview pattern={p.id} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>
      <p className="helper-note">{info.description}</p>

      <div className="param-row">
        <div className="param-label-row">
          <label htmlFor={pitchId}>
            {info.pitchLabel} ({uLabel})
          </label>
          <NumberField
            valueMm={params.livingHingePitchMm}
            minMm={pitchMin}
            maxMm={pitchMax}
            step={isInch ? 0.01 : 0.1}
            displayUnit={displayUnit}
            inDecimals={3}
            mmDecimals={2}
            id={pitchId}
            ariaLabel={info.pitchLabel}
            onChangeMm={(mm) => updateParam('livingHingePitchMm', mm)}
          />
        </div>
        <input
          type="range"
          min={pitchMin}
          max={pitchMax}
          step={0.1}
          value={params.livingHingePitchMm}
          aria-label={`${info.pitchLabel} slider`}
          onChange={(e) => updateParam('livingHingePitchMm', Number(e.target.value))}
        />
      </div>

      <div className="two-col-inputs">
        {info.usesCut && (
          <Field label={`Slit length (${uLabel})`}>
            <NumberField
              valueMm={params.livingHingeCutMm}
              minMm={MIN_HINGE_CUT_MM}
              maxMm={120}
              step={isInch ? 0.05 : 1}
              displayUnit={displayUnit}
              inDecimals={2}
              mmDecimals={1}
              ariaLabel="Slit length"
              onChangeMm={(mm) => updateParam('livingHingeCutMm', mm)}
            />
          </Field>
        )}
        <Field label={`Bridge (${uLabel})`}>
          <NumberField
            valueMm={params.livingHingeBridgeMm}
            minMm={MIN_HINGE_BRIDGE_MM}
            maxMm={12}
            step={isInch ? 0.01 : 0.1}
            displayUnit={displayUnit}
            inDecimals={3}
            mmDecimals={2}
            ariaLabel="Bridge"
            onChangeMm={(mm) => updateParam('livingHingeBridgeMm', mm)}
          />
        </Field>
      </div>

      <p className={web < MIN_SAFE_WEB_MM ? 'helper-note hinge-web-warning' : 'helper-note'} role="status">
        Narrowest wood between cuts: <strong>{isInch ? (web / 25.4).toFixed(3) : web.toFixed(2)} {uLabel}</strong>.
        {web < MIN_SAFE_WEB_MM && ' Under 1 mm it can char through or snap; widen the bridge or the spacing.'}
      </p>

      {handlers.openHingeCards && (
        <button type="button" className="btn btn-sm hinge-cards-open" onClick={handlers.openHingeCards}>
          Make test cards
        </button>
      )}

      <Field label="Attachment">
        <select
          value={params.livingHingeAttachMode}
          onChange={(e) =>
            updateParam('livingHingeAttachMode', e.target.value as BoxParameters['livingHingeAttachMode'])
          }
        >
          <option value="one-piece-back">One piece with the back wall, front catch slot</option>
          <option value="side-arch-tabs">One piece with the back wall, side retainer tabs</option>
          <option value="finger-joint-back">Finger-jointed to the back wall, front catch</option>
        </select>
      </Field>
    </>
  );
};
