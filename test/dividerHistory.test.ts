import { expect, it } from 'vitest';
import {
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  dividerHotkey,
  pushHistory,
  redoHistory,
  undoHistory,
} from '../src/ui/dividerHistory';

const A = [{ id: 'a', axis: 'y' as const, pos: 10, from: 0, to: 60 }];
const B = [...A, { id: 'b', axis: 'y' as const, pos: 30, from: 0, to: 60 }];

it('undoes and redoes', () => {
  const h = pushHistory(EMPTY_HISTORY, A);
  const u = undoHistory(h, B)!;
  expect(u.layout).toBe(A);
  expect(redoHistory(u.history, A)!.layout).toBe(B);
});
it('returns null with nothing to undo or redo', () => {
  expect(undoHistory(EMPTY_HISTORY, A)).toBeNull();
  expect(redoHistory(EMPTY_HISTORY, A)).toBeNull();
});
it('a new edit clears redo', () => {
  const u = undoHistory(pushHistory(EMPTY_HISTORY, A), B)!;
  expect(redoHistory(pushHistory(u.history, A), B)).toBeNull();
});
it('keeps at most 100 steps', () => {
  let h = EMPTY_HISTORY;
  for (let i = 0; i < 150; i++) h = pushHistory(h, A);
  expect(h.past).toHaveLength(HISTORY_LIMIT);
  expect(HISTORY_LIMIT).toBe(100);
});

const key = (k: string, extra: object = {}, target: unknown = null) =>
  dividerHotkey({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, target: target as EventTarget, ...extra });

it('maps the hotkeys', () => {
  expect(key('r')).toBe('flip');
  expect(key('R')).toBe('flip');
  expect(key('Delete')).toBe('delete');
  expect(key('Backspace')).toBe('delete');
  expect(key('Escape')).toBe('escape');
  expect(key('z', { metaKey: true })).toBe('undo');
  expect(key('z', { ctrlKey: true })).toBe('undo');
  expect(key('z', { metaKey: true, shiftKey: true })).toBe('redo');
  expect(key('Z', { ctrlKey: true, shiftKey: true })).toBe('redo');
  expect(key('z')).toBeNull();
  expect(key('r', { metaKey: true })).toBeNull();
  expect(key('x')).toBeNull();
});
it.each(['INPUT', 'TEXTAREA', 'SELECT'])('ignores every hotkey while typing in a %s', (tagName) => {
  const target = { tagName, isContentEditable: false };
  for (const k of ['r', 'Delete', 'Backspace', 'Escape']) expect(key(k, {}, target)).toBeNull();
  expect(key('z', { metaKey: true }, target)).toBeNull();
});
it('ignores hotkeys in contenteditable', () => {
  expect(key('Delete', {}, { tagName: 'DIV', isContentEditable: true })).toBeNull();
});
