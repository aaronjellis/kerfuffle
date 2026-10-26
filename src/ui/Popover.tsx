import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  open: boolean;
  /** Closes the popover. Focus goes back to the trigger unless `returnFocus` is false. */
  onClose: (returnFocus?: boolean) => void;
  anchorRef: React.RefObject<HTMLElement>;
  id: string;
  role?: 'dialog' | 'menu';
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
}

const GAP = 6;
const EDGE = 8;
const FOCUSABLE = 'button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A panel anchored below its trigger, or above it when there's more room there. It closes on Escape and on a click outside, and focus
 * returns to the trigger. It sits left-aligned to the trigger, or right-aligned when that
 * would run off the window. Rendered into `document.body`, so no parent's overflow clips it.
 */
export const Popover: React.FC<PopoverProps> = ({
  open,
  onClose,
  anchorRef,
  id,
  role = 'dialog',
  ariaLabel,
  className,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const a = anchor.getBoundingClientRect();
    const w = panel.offsetWidth;
    let left = a.left;
    if (left + w > window.innerWidth - EDGE) left = a.right - w;
    left = Math.max(EDGE, left);
    // Below the trigger, unless it doesn't fit there and there's more room above (a trigger
    // in the phone's bottom sheet). Either way it scrolls inside the room it gets.
    const h = panel.scrollHeight + 2;
    const below = window.innerHeight - a.bottom - GAP - EDGE;
    const above = a.top - GAP - EDGE;
    const flip = h > below && above > below;
    const maxHeight = Math.max(0, Math.round(flip ? above : below));
    const top = flip ? a.top - GAP - Math.min(h, above) : a.bottom + GAP;
    // Unchanged on most scroll and resize events; keep the same object so nothing re-renders.
    setPos((prev) =>
      prev && prev.top === top && prev.left === left && prev.maxHeight === maxHeight
        ? prev
        : { top, left, maxHeight }
    );
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
  }, [open, place]);

  // Focus the first control once the panel is placed.
  useEffect(() => {
    if (!open || !pos) return;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const current = panel.querySelector<HTMLElement>('[aria-current="true"]');
      (current ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();
    }
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(true);
      }
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      // A click on another control keeps its focus; a click on empty space hands it back.
      const focusable = (t as Element).closest?.(FOCUSABLE + ', a[href], textarea, canvas, svg');
      onClose(!focusable);
    };
    // Tabbing out of both the panel and the trigger closes it. A null target (the window lost
    // focus, or a control was disabled) is left alone.
    const onFocusOut = (e: FocusEvent) => {
      const from = e.target as Node;
      const to = e.relatedTarget as Node | null;
      const inside = (n: Node) => panelRef.current?.contains(n) || anchorRef.current?.contains(n);
      if (!inside(from) || !to || inside(to)) return;
      onClose(false);
    };
    const onReflow = () => place();
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, onClose, anchorRef, place]);

  if (!open) return null;

  // Up and down arrows move between the panel's buttons.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  };

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role={role}
      aria-label={ariaLabel}
      tabIndex={-1}
      className={`popover${className ? ` ${className}` : ''}`}
      style={pos ? pos : { top: 0, left: 0, visibility: 'hidden' }}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>,
    document.body
  );
};

/** Open state and a trigger ref for one popover; `close()` hands focus back to the trigger. */
export function usePopover<T extends HTMLElement>() {
  const anchorRef = useRef<T>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) anchorRef.current?.focus();
  }, []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  return { anchorRef, open, close, toggle };
}
