import React, { useEffect, useRef } from 'react';
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
  /** Set on every chip click and stage pick; `n` changes each time, so a repeat scrolls again. */
  scrollRequest: { id: PartId; n: number } | null;
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
  scrollRequest,
  sectionProps,
}) => {
  const asideRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const query = settingQuery.trim();

  // The opened section scrolls to the top of the list (on a phone, to just under the pinned
  // chips), and the pressed chip scrolls sideways into its track.
  useEffect(() => {
    if (!scrollRequest) return;
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    const section = scrollRef.current?.querySelector<HTMLElement>(`[data-part="${scrollRequest.id}"]`);
    section?.scrollIntoView({ block: 'start', behavior });
    // The track is scrolled by hand: scrollIntoView on the chip would also scroll the sheet
    // and cut the section's scroll short.
    const track = asideRef.current?.querySelector<HTMLElement>('.parts-row-track');
    const chip = track?.querySelector<HTMLElement>(`[data-ph-capture-attribute-part="${scrollRequest.id}"]`);
    if (!track || !chip) return;
    const fade = 16; // the track's 1 rem edge fade
    const t = track.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const dx = c.left < t.left + fade ? c.left - t.left - fade : c.right > t.right - fade ? c.right - t.right + fade : 0;
    if (dx !== 0) track.scrollBy({ left: dx, behavior });
  }, [scrollRequest]);

  return (
    <aside className="inspector" aria-label="Settings" ref={asideRef}>
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
      <PartsRow parts={parts} selected={selectedPart} onSelect={onSelectPart} />

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
