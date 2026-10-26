import React from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { PartId } from './parts';

interface SectionProps {
  id: PartId;
  title: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: (id: PartId) => void;
  children: React.ReactNode;
}

/**
 * One collapsible inspector section. The parent owns which section is open: clicking the
 * summary calls `onToggle` and the native toggle is suppressed, so `open` stays the truth.
 */
export const Section: React.FC<SectionProps> = ({ id, title, icon: Icon, open, onToggle, children }) => (
  <details className="inspect-fold" open={open} data-part={id}>
    <summary
      aria-expanded={open}
      data-ph-capture-attribute-part={id}
      onClick={(e) => {
        e.preventDefault();
        onToggle(id);
      }}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <span className="inspect-fold-title">{title}</span>
      <ChevronRight size={18} strokeWidth={1.75} className="icon inspect-fold-chevron" aria-hidden="true" />
    </summary>
    <div className="inspect-fold-body">{children}</div>
  </details>
);
