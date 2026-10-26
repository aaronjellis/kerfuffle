import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { BoxCategory, BoxTemplateId } from '../engine/types';
import type { PartDef, PartId } from './parts';
import { PartsRow } from './PartsRow';
import { Section } from './Section';
import { SECTION_COMPONENTS } from './sections';
import type { SectionProps } from './sections/types';
import { TemplatePopover } from './TemplatePopover';

interface InspectorProps {
  templateId: BoxTemplateId;
  category: BoxCategory;
  onSelectTemplate: (id: BoxTemplateId) => void;
  settingQuery: string;
  onSettingQuery: (query: string) => void;
  /** Every part of the current template, for the chips. */
  parts: PartDef[];
  /** The parts the search leaves showing, as sections. */
  visibleParts: PartDef[];
  selectedPart: PartId | null;
  /** A chip: opens that part's section and clears the search. */
  onSelectPart: (id: PartId) => void;
  /** A section header: opens or closes it. */
  onTogglePart: (id: PartId) => void;
  sectionProps: SectionProps;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The right panel: the template, the settings search, the parts chips, and one section per part. */
export const Inspector: React.FC<InspectorProps> = ({
  templateId,
  category,
  onSelectTemplate,
  settingQuery,
  onSettingQuery,
  parts,
  visibleParts,
  selectedPart,
  onSelectPart,
  onTogglePart,
  sectionProps,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Bumped on every chip click, so a second click on the same chip scrolls again.
  const [scrollTarget, setScrollTarget] = useState<{ id: PartId; n: number } | null>(null);
  const query = settingQuery.trim();

  useEffect(() => {
    if (!scrollTarget) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-part="${scrollTarget.id}"]`);
    el?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [scrollTarget]);

  const chooseChip = (id: PartId) => {
    onSelectPart(id);
    setScrollTarget((prev) => ({ id, n: (prev?.n ?? 0) + 1 }));
  };

  return (
    <aside className="inspector" aria-label="Settings">
      <div className="inspect-head">
        <TemplatePopover category={category} templateId={templateId} onSelectTemplate={onSelectTemplate} />
        <div className="inspect-search">
          <Search size={18} strokeWidth={1.75} className="inspect-search-icon" aria-hidden="true" />
          <input
            type="search"
            aria-label="Find a setting"
            placeholder="Find a setting: kerf, hinge, label"
            value={settingQuery}
            onChange={(e) => onSettingQuery(e.target.value)}
          />
          {settingQuery && (
            <button
              type="button"
              className="inspect-search-clear"
              aria-label="Clear search"
              onClick={() => onSettingQuery('')}
            >
              <X size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <PartsRow parts={parts} selected={selectedPart} onSelect={chooseChip} />

      <div className="inspect-scroll" ref={scrollRef}>
        {visibleParts.map((part) => {
          const Body = SECTION_COMPONENTS[part.id];
          return (
            <Section
              key={part.id}
              id={part.id}
              title={part.label}
              icon={part.icon}
              open={query ? true : selectedPart === part.id}
              onToggle={onTogglePart}
            >
              <Body {...sectionProps} />
            </Section>
          );
        })}
        {visibleParts.length === 0 && <p className="inspect-empty">No setting matches “{query}”.</p>}
      </div>
    </aside>
  );
};
