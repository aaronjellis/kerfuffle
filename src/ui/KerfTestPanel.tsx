import React from 'react';
import { Download, X } from 'lucide-react';
import { MaterialSection } from './sections/MaterialSection';
import type { SectionProps } from './sections/types';

interface KerfTestPanelProps {
  /** The six kerf values on the test pieces, top side first. */
  values: number[];
  picked: number | null;
  onPick: (value: number) => void;
  /** −1 for a looser set of values, +1 for a tighter one. */
  onShift: (dir: -1 | 1) => void;
  onDownloadSvg: () => void;
  /** Sets the kerf to the picked value and closes. */
  onUse: () => void;
  onSkip: () => void;
  /** The material step reuses the Material section. */
  sectionProps: SectionProps;
}

/**
 * Takes the inspector's place while the kerf test is open: pick the material, cut two hexagons,
 * and keep the side that fits best as the laser kerf. The stage shows the test pieces meanwhile.
 */
export const KerfTestPanel: React.FC<KerfTestPanelProps> = ({
  values,
  picked,
  onPick,
  onShift,
  onDownloadSvg,
  onUse,
  onSkip,
  sectionProps,
}) => (
  <aside className="inspector kerf-test" aria-label="Kerf test">
    <div className="inspect-head kerf-test-head">
      <h2>Find your fit</h2>
      <button type="button" className="icon-btn" aria-label="Skip the kerf test" title="Skip" onClick={onSkip}>
        <X size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
    <div className="inspect-scroll">
      <div className="kerf-test-body">
        <p className="helper-note">
          Every laser burns away a little material, and every sheet is a little different. Cut two test
          hexagons and feel which joint fits best; every box after that uses it. Making cardboard boxes? You can
          skip this.
        </p>

        <ol className="kerf-test-steps">
          <li>
            <h3>Pick your material</h3>
            {/* The section-body class brings the inspector's field styles. */}
            <div className="inspect-fold-body kerf-test-material">
              <MaterialSection {...sectionProps} />
            </div>
          </li>
          <li>
            <h3>Cut the test pieces</h3>
            <p className="helper-note">
              Export the two hexagons with <strong>Export</strong> at the top, or download the SVG here, and cut them
              from the same sheet.
            </p>
            <button type="button" className="btn btn-sm" onClick={onDownloadSvg}>
              <Download size={16} strokeWidth={1.75} aria-hidden="true" />
              Download SVG
            </button>
          </li>
          <li>
            <h3>Which side fit best?</h3>
            <p className="helper-note">
              Keep both pieces face up. Slide B against each side of A, where the matching numbers meet, and press.
              Pick the tightest side that still goes together by hand; it becomes your kerf for every box after this.
            </p>
            <div className="chip-row kerf-test-values" role="radiogroup" aria-label="Which side fit best?">
              {values.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={picked === v}
                  className="chip"
                  onClick={() => onPick(v)}
                >
                  {v.toFixed(2)}
                </button>
              ))}
            </div>
            <div className="two-col-inputs">
              <button type="button" className="btn btn-sm" onClick={() => onShift(1)}>
                All too loose
              </button>
              <button type="button" className="btn btn-sm" onClick={() => onShift(-1)}>
                All too tight
              </button>
            </div>
            <p className="helper-note">Either one makes a new set of values; export and cut again.</p>
          </li>
        </ol>

        <div className="kerf-test-actions">
          <button type="button" className="btn-primary" disabled={picked === null} onClick={onUse}>
            {picked === null ? 'Pick a side to finish' : `Use ${picked.toFixed(2)} mm kerf`}
          </button>
          <button type="button" className="btn" onClick={onSkip}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  </aside>
);
