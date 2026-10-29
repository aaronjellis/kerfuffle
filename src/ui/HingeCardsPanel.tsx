import React from 'react';
import { Download, X } from 'lucide-react';
import { HINGE_PATTERNS, hingePatternInfo, type HingePatternId, type HingePatternSettings } from '../engine/livingHinge';
import type { HingeCardSweep } from '../engine/hingeCards';
import { MaterialSection } from './sections/MaterialSection';
import { HingePatternPreview } from './sections/LivingHingeSection';
import type { SectionProps } from './sections/types';

interface HingeCardsPanelProps {
  patterns: HingePatternId[];
  onTogglePattern: (id: HingePatternId) => void;
  sweep: HingeCardSweep;
  onSweep: (sweep: HingeCardSweep) => void;
  /** Every card's settings, in sheet order. */
  cards: HingePatternSettings[];
  picked: number | null;
  onPick: (index: number) => void;
  onDownloadSvg: () => void;
  /** Gives the box the picked card's pattern and closes. */
  onUse: () => void;
  onClose: () => void;
  sectionProps: SectionProps;
}

const SWEEPS: { value: HingeCardSweep; label: string }[] = [
  { value: 'none', label: 'One card each' },
  { value: 'pitch', label: 'Three spacings' },
  { value: 'bridge', label: 'Three bridges' },
];

const num = (v: number) => Number(v.toFixed(2)).toString();

/** A card's settings in a few words: "Straight, spacing 2.5, bridge 3.5". */
export const describeCard = (s: HingePatternSettings) => {
  const info = hingePatternInfo(s.pattern);
  return `${info.name}, ${info.usesCut ? 'spacing' : 'cell'} ${num(s.pitchMm)}, bridge ${num(s.bridgeMm)}`;
};

/**
 * Takes the inspector's place while the hinge test cards are open: pick patterns, cut a card for
 * each, bolt them into a fan, and bend them to choose the box's pattern. The stage shows the fan.
 */
export const HingeCardsPanel: React.FC<HingeCardsPanelProps> = ({
  patterns,
  onTogglePattern,
  sweep,
  onSweep,
  cards,
  picked,
  onPick,
  onDownloadSvg,
  onUse,
  onClose,
  sectionProps,
}) => (
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
          Each pattern bends differently in every wood. Cut a card for each, bolt them together through the corner
          hole, and bend them by hand to find the one you like.
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
            <div className="chip-row" role="radiogroup" aria-label="Cards per pattern">
              {SWEEPS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={sweep === s.value}
                  className="chip"
                  onClick={() => onSweep(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="helper-note">
              {cards.length === 0
                ? 'Pick at least one pattern.'
                : `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}, 50 × 100 mm each, for an M5 bolt.`}
              {sweep !== 'none' && ' Each pattern gets a card a step under its usual size, one at it, and one over.'}
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
            <p className="helper-note">The box's lid uses the card you pick.</p>
            <div className="hinge-card-list" role="radiogroup" aria-label="Which card bent best?">
              {cards.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={picked === i}
                  className="chip"
                  onClick={() => onPick(i)}
                >
                  <span className="hinge-card-no">{i + 1}</span>
                  {describeCard(c)}
                </button>
              ))}
            </div>
          </li>
        </ol>

        <div className="kerf-test-actions">
          <button type="button" className="btn-primary" disabled={picked === null} onClick={onUse}>
            {picked === null ? 'Pick a card to finish' : `Use card ${picked + 1}`}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  </aside>
);
