import React from 'react';
import type { PartDef, PartId } from './parts';

interface PartsRowProps {
  parts: PartDef[];
  selected: PartId | null;
  onSelect: (id: PartId) => void;
}

/** One chip per part, in a single row that scrolls sideways; a chip opens its section. */
export const PartsRow: React.FC<PartsRowProps> = ({ parts, selected, onSelect }) => (
  <div className="parts-row" role="group" aria-label="Parts">
    <div className="parts-row-track">
      {parts.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className="part-chip"
          aria-pressed={selected === id}
          data-ph-capture-attribute-part={id}
          onClick={() => onSelect(id)}
        >
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  </div>
);
