import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import type { FontFamily } from '../engine/fontCatalog';
import { loadPreviewCss } from '../engine/previewFonts';
import type { PreviewFace } from '../engine/previewFonts';
import { filterFamilies, previewFace, pushRecentFont, readRecentFonts } from './fontList';
import type { CategoryFilter } from './fontList';
import { PHONE_QUERY, useMediaQuery } from './useMediaQuery';

/** Tiles this far outside the list's view still count as appearing, so their face is ready before they scroll in. */
const ROOT_MARGIN = '400px';
/** Families per Google Fonts request. */
const BATCH = 12;

const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sans-serif', label: 'Sans serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'display', label: 'Display' },
  { value: 'handwriting', label: 'Handwriting' },
  { value: 'monospace', label: 'Monospace' },
  { value: 'stencil', label: 'Stencil' },
];

/** A family's CSS `font-family` value, with a generic to fall back on until its stylesheet arrives. */
const faceOf = (f: Pick<FontFamily, 'family' | 'category'>): string =>
  `"${f.family.replace(/["\\]/g, '')}", ${f.category === 'serif' ? 'serif' : f.category === 'monospace' ? 'monospace' : 'sans-serif'}`;

interface FontPickerProps {
  /** Every family, or null while the list is loading. */
  catalog: FontFamily[] | null;
  /** The family in use. */
  value: string;
  /** The text each tile shows in its face. */
  sampleText: string;
  /** The text's weight and style: each tile previews its family as near to them as it comes, as the stage draws it. */
  weight: number;
  style: 'normal' | 'italic';
  onPick: (family: FontFamily) => void;
  onClose: () => void;
}

/**
 * A panel over the inspector (a full-screen sheet on a phone) listing every family as a tile that
 * shows the sample text in its own face, at the text's weight and style, so a tile looks like the stage
 * will. A tile's stylesheet is requested only as it nears the view.
 * Picking a tile applies it and keeps the panel open, so you can try several; Done, Escape, or a click
 * outside closes it.
 */
export const FontPicker: React.FC<FontPickerProps> = ({ catalog, value, sampleText, weight, style, onPick, onClose }) => {
  const phone = useMediaQuery(PHONE_QUERY);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [recent] = useState(() => readRecentFonts());
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const queue = useRef<PreviewFace[]>([]);
  const host = useMemo(() => (phone ? document.body : (document.querySelector<HTMLElement>('.inspector') ?? document.body)), [phone]);

  const shown = useMemo(() => (catalog ? filterFamilies(catalog, query, category) : []), [catalog, query, category]);
  const recentFamilies = useMemo(
    () => (catalog ? recent.flatMap((name) => catalog.find((f) => f.family === name) ?? []) : []),
    [catalog, recent]
  );
  const sample = sampleText.trim() || 'Aa';
  const byName = useMemo(() => new Map((catalog ?? []).map((f) => [f.family, f])), [catalog]);
  /** The face to load for a family: the text's weight and style as the family has them; its regular face when the catalog doesn't know it. */
  const faceFor = useCallback(
    (family: string): PreviewFace => {
      const f = byName.get(family);
      return f ? { family, ...previewFace(f, weight, style) } : { family, weight: 400, style: 'normal' };
    },
    [byName, weight, style]
  );

  // Tiles that come within the margin ask for their stylesheet, a dozen families to a request.
  const flush = useCallback(() => {
    while (queue.current.length > 0) void loadPreviewCss(queue.current.splice(0, BATCH));
  }, []);
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.unobserve(entry.target);
          const family = (entry.target as HTMLElement).dataset.family;
          if (family) queue.current.push(faceFor(family));
        }
        flush();
      },
      { root: list, rootMargin: ROOT_MARGIN }
    );
    observer.current = io;
    // The first tiles mounted before this observer existed; a new weight or style watches them all again.
    list.querySelectorAll('.font-tile').forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      observer.current = null;
    };
  }, [flush, faceFor]);

  /** Watches a tile until it has asked for its face. */
  const watch = useCallback((el: HTMLElement | null) => {
    if (el) observer.current?.observe(el);
  }, []);

  // The chosen and recent families show their faces at once.
  useEffect(() => {
    void loadPreviewCss([value, ...recent].map(faceFor));
  }, [value, recent, faceFor]);

  // Focus moves in on open and back to where it was on close.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    // A phone's keyboard would cover the list, so only a desktop opens on the search field.
    if (!phone) searchRef.current?.focus();
    return () => before?.focus?.();
  }, []);

  // Escape closes the picker wherever focus is: on a phone it is often on the body, not in the panel.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (f: FontFamily) => {
    pushRecentFont(f.family);
    onPick(f);
  };

  const tile = (f: FontFamily, chip: boolean) => {
    const face = previewFace(f, weight, style);
    return (
      <button
        key={f.id}
        ref={chip ? undefined : watch}
        type="button"
        className={`${chip ? 'font-chip' : 'font-tile'} ph-no-capture`}
        data-family={f.family}
        aria-pressed={f.family === value}
        onClick={() => pick(f)}
      >
        <span className="font-tile-name">{f.family}</span>
        <span className="font-tile-sample" style={{ fontFamily: faceOf(f), fontWeight: face.weight, fontStyle: face.style }}>
          {sample}
        </span>
      </button>
    );
  };

  return createPortal(
    <div
      className={`font-picker${phone ? ' font-picker-sheet' : ''}`}
    >
      <div className="font-picker-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="font-picker-panel" role="dialog" aria-modal="true" aria-label="Choose a font">
        <div className="font-picker-head">
          <div className="inspect-search">
            <Search size={18} strokeWidth={1.75} className="inspect-search-icon" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              aria-label="Search fonts"
              placeholder="Search fonts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="chip-row" role="radiogroup" aria-label="Font category">
          {CATEGORIES.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked={category === c.value} className="chip" onClick={() => setCategory(c.value)}>
              {c.label}
            </button>
          ))}
        </div>

        <div className="font-picker-list" ref={listRef}>
          {recentFamilies.length > 0 && query.trim() === '' && category === 'all' && (
            <section aria-label="Recent fonts">
              <h3 className="font-picker-heading">Recent</h3>
              <div className="font-recent-row">{recentFamilies.map((f) => tile(f, true))}</div>
            </section>
          )}
          {catalog === null ? (
            <p className="helper-note font-picker-note" role="status">
              Loading fonts…
            </p>
          ) : shown.length === 0 ? (
            <p className="helper-note font-picker-note" role="status">
              No font matches “{query.trim()}”.
            </p>
          ) : (
            <>
              <h3 className="font-picker-heading">
                {shown.length.toLocaleString()} {shown.length === 1 ? 'family' : 'families'}
              </h3>
              <div className="font-tile-grid">{shown.map((f) => tile(f, false))}</div>
            </>
          )}
        </div>
      </div>
    </div>,
    host
  );
};
