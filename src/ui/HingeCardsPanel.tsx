import React from 'react';
import { Download, X } from 'lucide-react';
import {
  HINGE_PATTERNS,
  hingeBendRadiusMm,
  hingePatternInfo,
  type HingePatternId,
  type HingePatternSettings,
} from '../engine/livingHinge';
import { CARD_HEIGHT_MM, CARD_WIDTH_MM, ZONE_LETTERS, type HingeCardSet, type HingeCardVary } from '../engine/hingeCards';
import { MaterialSection } from './sections/MaterialSection';
import { HingePatternPreview } from './sections/LivingHingeSection';
import type { SectionProps } from './sections/types';

interface HingeCardsPanelProps {
  patterns: HingePatternId[];
  onTogglePattern: (id: HingePatternId) => void;
  vary: HingeCardVary;
  onVary: (vary: HingeCardVary) => void;
  /** Every card, in sheet order. */
  cards: HingeCardSet[];
  picked: HingeCardPick | null;
  onPick: (pick: HingeCardPick) => void;
  onDownloadSvg: () => void;
  /** Gives the box the picked card's pattern and closes. */
  onUse: () => void;
  onClose: () => void;
  sectionProps: SectionProps;
}

/** A zone on a card: the card's index in sheet order and the zone's, A to C. */
export interface HingeCardPick {
  card: number;
  zone: number;
}

const VARIES: { value: HingeCardVary; label: string }[] = [
  { value: 'pitch', label: 'Row spacing' },
  { value: 'cut', label: 'Slit length' },
  { value: 'bridge', label: 'Bridge' },
];

const num = (v: number) => Number(v.toFixed(2)).toString();

/** A zone's settings in a few words: "spacing 1.5, slit 30, bridge 3". */
export const describeZone = (s: HingePatternSettings) =>
  hingePatternInfo(s.pattern).usesCut
    ? `spacing ${num(s.pitchMm)}, slit ${num(s.cutMm)}, bridge ${num(s.bridgeMm)}`
    : `spacing ${num(s.pitchMm)}, bridge ${num(s.bridgeMm)}`;

/**
 * Takes the inspector's place while the hinge test cards are open: pick patterns, cut a card for
 * each, bolt them into a fan, and bend them to choose the box's pattern. The stage shows the fan.
 */
export const HingeCardsPanel: React.FC<HingeCardsPanelProps> = ({
  patterns,
  onTogglePattern,
  vary,
  onVary,
  cards,
  picked,
  onPick,
  onDownloadSvg,
  onUse,
  onClose,
  sectionProps,
}) => {
  const { materialThicknessMm: T, kerfMm } = sectionProps.params;
  const bend = (s: HingePatternSettings) => {
    const r = hingeBendRadiusMm(s, T, kerfMm, CARD_WIDTH_MM);
    return Number.isFinite(r) ? `bends to about R${Math.round(r)}` : 'no bend';
  };
  const pickedZone = picked ? cards[picked.card]?.zones[picked.zone] : undefined;
  return (
  <aside className="inspector kerf-test" aria-label="Hinge test cards">
    <div className="inspect-head kerf-test-head">
      <h2>Hinge test cards</h2>
      <button type="button" className="icon-btn" aria-label="Close the test cards" title="Close" onClick={onClose}>
        <X size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
    <div className="inspect-scroll">
      <div className="kerf-test-body">
        <p className="helper-note">
          Each pattern bends differently in every wood. Cut a card for each: every card has three zones, each
          engraved with its settings, stepping one setting from tight to loose. Bend each zone by hand to feel the
          difference, and bolt the set together through the corner hole.
        </p>

        <ol className="kerf-test-steps">
          <li>
            <h3>Pick your material</h3>
            <div className="inspect-fold-body kerf-test-material">
              <MaterialSection {...sectionProps} />
            </div>
          </li>
          <li>
            <h3>Choose the cards</h3>
            <div className="pattern-picker hinge-picker" role="group" aria-label="Patterns on the cards">
              {HINGE_PATTERNS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={patterns.includes(p.id)}
                  aria-label={p.name}
                  className="pattern-tile"
                  onClick={() => onTogglePattern(p.id)}
                >
                  <HingePatternPreview pattern={p.id} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
            <h4 className="hinge-card-subhead">Zones A to C vary</h4>
            <div className="chip-row" role="radiogroup" aria-label="Zones A to C vary">
              {VARIES.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  role="radio"
                  aria-checked={vary === v.value}
                  className="chip"
                  onClick={() => onVary(v.value)}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <p className="helper-note">
              {cards.length === 0
                ? 'Pick at least one pattern.'
                : `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}, ${CARD_WIDTH_MM} × ${CARD_HEIGHT_MM} mm each, for an M5 bolt. Zone B is the pattern's usual size; A is a step under, C a step over.${vary === 'cut' && cards.some((c) => !hingePatternInfo(c.pattern).usesCut) ? ' Serpentine has no slit length, so its zones step the row spacing.' : ''}`}
            </p>
            <p className="helper-note">
              Each zone's line reads, for example, <strong>A SP 1.2 SL 30 BR 3 R11</strong>: spacing, slit length and
              bridge in millimetres, then the estimated bend radius.
            </p>
          </li>
          <li>
            <h3>Cut them</h3>
            <p className="helper-note">
              Export with <strong>Export</strong> at the top, or download the SVG here. The labels engrave on the score
              layer.
            </p>
            <button type="button" className="btn btn-sm" onClick={onDownloadSvg} disabled={cards.length === 0}>
              <Download size={16} strokeWidth={1.75} aria-hidden="true" />
              Download SVG
            </button>
          </li>
          <li>
            <h3>Which bent best?</h3>
            <p className="helper-note">The box's lid uses the zone you pick.</p>
            {cards.map((c, i) => (
              <div key={c.pattern} className="hinge-card-group">
                <h4 className="hinge-card-subhead">
                  Card {i + 1}: {hingePatternInfo(c.pattern).name}
                </h4>
                <div className="hinge-card-list" role="radiogroup" aria-label={`Card ${i + 1} zones`}>
                  {c.zones.map((z, k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={picked?.card === i && picked.zone === k}
                      className="chip"
                      onClick={() => onPick({ card: i, zone: k })}
                    >
                      <span className="hinge-card-no">{ZONE_LETTERS[k]}</span>
                      {describeZone(z)}, {bend(z)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </li>
        </ol>

        <div className="kerf-test-actions">
          <button type="button" className="btn-primary" disabled={picked === null} onClick={onUse}>
            {picked && pickedZone
              ? `Use card ${picked.card + 1}, zone ${ZONE_LETTERS[picked.zone]}`
              : 'Pick a zone to finish'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  </aside>
  );
};
