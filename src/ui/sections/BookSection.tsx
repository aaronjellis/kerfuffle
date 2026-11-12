import React from 'react';
import { NumberField } from '../../components/NumberField';
import { BOOK_OVERHANG_MAX_MM, BOOK_PAGE_LINE_RANGE_MM, bookLayout, bookMinOverhangMm, bookPinCount } from '../../engine/bookBox';
import { Field, Switch } from '../Field';
import { unitHelpers } from './shared';
import type { SectionProps } from './types';

/** Book box: the covers' overhang, the spine's curve, the guide pins and the page lines. */
export const BookSection: React.FC<SectionProps> = ({ params, updateParam, displayUnit, model }) => {
  const { isInch, uLabel } = unitHelpers(displayUnit);
  const T = params.materialThicknessMm;
  const { widthMm, depthMm, heightMm } = model.innerDims;
  const layout = bookLayout(params, widthMm, depthMm, heightMm);
  const fullRadius = (heightMm + T) / 2;
  const minOverhang = bookMinOverhangMm(T);
  const len = (v: number) => (isInch ? (v / 25.4).toFixed(2) : v.toFixed(1));
  return (
    <>
      <Field label={`Cover overhang (${uLabel})`}>
        <NumberField
          valueMm={layout.ovMm}
          minMm={minOverhang}
          maxMm={Math.max(BOOK_OVERHANG_MAX_MM, minOverhang)}
          step={isInch ? 0.02 : 0.5}
          displayUnit={displayUnit}
          inDecimals={2}
          mmDecimals={1}
          ariaLabel="Cover overhang"
          onChangeMm={(mm) => updateParam('bookCoverOverhangMm', mm)}
        />
      </Field>
      <p className="helper-note">
        How far the covers reach past the page edges at the head, tail and fore edge. At least {len(minOverhang)} {uLabel},
        so the slots in the covers keep sound wood outside them.
      </p>

      <Switch
        label="Full round spine"
        checked={layout.fullRound}
        onChange={(v) => updateParam('bookSpineRadiusMm', v ? 0 : Math.max(T, Math.round(fullRadius * 0.6 * 2) / 2))}
      />
      {!layout.fullRound && (
        <Field label={`Spine radius (${uLabel})`}>
          <NumberField
            valueMm={layout.radiusMm}
            minMm={Math.min(T, fullRadius)}
            maxMm={fullRadius}
            step={isInch ? 0.02 : 0.5}
            displayUnit={displayUnit}
            inDecimals={2}
            mmDecimals={1}
            ariaLabel="Spine radius"
            onChangeMm={(mm) => updateParam('bookSpineRadiusMm', mm >= fullRadius - 0.01 ? 0 : mm)}
          />
        </Field>
      )}
      <p className="helper-note" role="status">
        {layout.fullRound
          ? 'The spine is one half-round, with hinge cuts all the way across.'
          : `The spine curves at each cover and keeps a solid band ${len(layout.flatBandMm)} ${uLabel} tall between them.`}
      </p>

      <Switch label="Guide pins" checked={params.bookGuidePins} onChange={(v) => updateParam('bookGuidePins', v)} />
      {params.bookGuidePins && bookPinCount(depthMm, T) === 0 && (
        <p className="helper-note hinge-web-warning" role="status">
          The book is too short from head to tail for a pin, so nothing holds the cover shut. Make it deeper.
        </p>
      )}
      <p className="helper-note">
        Pins on the fore-edge wall press into slots in the front cover and hold it shut. Lift the cover by its
        overhanging edge to open it.
      </p>

      <Switch label="Engrave page lines" checked={params.bookPageLines} onChange={(v) => updateParam('bookPageLines', v)} />
      {params.bookPageLines && (
        <Field label={`Line spacing (${uLabel})`}>
          <NumberField
            valueMm={params.bookPageLineSpacingMm}
            minMm={BOOK_PAGE_LINE_RANGE_MM[0]}
            maxMm={BOOK_PAGE_LINE_RANGE_MM[1]}
            step={isInch ? 0.01 : 0.1}
            displayUnit={displayUnit}
            inDecimals={3}
            mmDecimals={1}
            ariaLabel="Page line spacing"
            onChangeMm={(mm) => updateParam('bookPageLineSpacingMm', mm)}
          />
        </Field>
      )}
      <p className="helper-note">
        Fine lines engraved along the head, tail and fore edge, like the edges of pages. They go on the score layer, so
        the laser marks them and doesn't cut through. A side with a see-through pattern gets the pattern and no lines.
      </p>
    </>
  );
};
