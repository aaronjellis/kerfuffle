import React from 'react';
import { ArrowRight, ChevronRight, type LucideIcon } from 'lucide-react';
import type { PartId } from './parts';

interface SectionProps {
  id: PartId;
  title: string;
  icon: LucideIcon;
  /** Where this part falls in the box's steps, from 1. */
  step: number;
  open: boolean;
  onToggle: (id: PartId) => void;
  /** The step after this one; absent on the last step, and while searching. */
  next?: { title: string; onGo: () => void };
  /** Set on the last step: points to Export. */
  last?: boolean;
  children: React.ReactNode;
}

/**
 * One collapsible inspector section, numbered as a step. The parent owns which section is open:
 * clicking the summary calls `onToggle` and the native toggle is suppressed, so `open` stays the
 * truth. An open section ends with a button to the next step.
 */
export const Section: React.FC<SectionProps> = ({ id, title, icon: Icon, step, open, onToggle, next, last, children }) => (
  <details className="inspect-fold" open={open} data-part={id}>
    <summary
      aria-expanded={open}
      data-ph-capture-attribute-part={id}
      onClick={(e) => {
        e.preventDefault();
        onToggle(id);
      }}
    >
      <span className="step-badge" aria-label={`Step ${step}`}>
        {step}
      </span>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <span className="inspect-fold-title">{title}</span>
      <ChevronRight size={18} strokeWidth={1.75} className="icon inspect-fold-chevron" aria-hidden="true" />
    </summary>
    <div className="inspect-fold-body">
      {children}
      {next && (
        <button type="button" className="btn btn-sm step-next" onClick={next.onGo}>
          Next: {next.title}
          <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
      {last && (
        <p className="helper-note step-done">
          That's the last step. Use <strong>Export</strong> at the top to download your files.
        </p>
      )}
    </div>
  </details>
);
