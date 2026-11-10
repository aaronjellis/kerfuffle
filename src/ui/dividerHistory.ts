import type { PrintDivider } from '../engine/types';

/** Undo and redo for divider edits only: each entry is a whole layout. */
export interface DividerHistory {
  past: PrintDivider[][];
  future: PrintDivider[][];
}

export const EMPTY_HISTORY: DividerHistory = { past: [], future: [] };
export const HISTORY_LIMIT = 100;

/** Records `before` (the layout an edit is about to replace) as an undo step and clears redo. */
export function pushHistory(h: DividerHistory, before: PrintDivider[]): DividerHistory {
  return { past: [...h.past, before].slice(-HISTORY_LIMIT), future: [] };
}

export function undoHistory(
  h: DividerHistory,
  current: PrintDivider[],
): { history: DividerHistory; layout: PrintDivider[] } | null {
  if (h.past.length === 0) return null;
  const layout = h.past[h.past.length - 1];
  return { history: { past: h.past.slice(0, -1), future: [...h.future, current] }, layout };
}

export function redoHistory(
  h: DividerHistory,
  current: PrintDivider[],
): { history: DividerHistory; layout: PrintDivider[] } | null {
  if (h.future.length === 0) return null;
  const layout = h.future[h.future.length - 1];
  return { history: { past: [...h.past, current], future: h.future.slice(0, -1) }, layout };
}

/** True when the key event came from somewhere the user types. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (!el || typeof el !== 'object') return false;
  if (el.isContentEditable === true) return true;
  return typeof el.tagName === 'string' && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName.toUpperCase());
}

export type DividerHotkey = 'flip' | 'delete' | 'escape' | 'undo' | 'redo';

/** The divider tools' action for a key press; null when the key isn't theirs or the user is typing. */
export function dividerHotkey(
  e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'target'>,
): DividerHotkey | null {
  if (isTypingTarget(e.target)) return null;
  const key = e.key.toLowerCase();
  const mod = e.metaKey || e.ctrlKey;
  if (mod) return key === 'z' ? (e.shiftKey ? 'redo' : 'undo') : null;
  if (key === 'r') return 'flip';
  if (key === 'delete' || key === 'backspace') return 'delete';
  if (key === 'escape') return 'escape';
  return null;
}
