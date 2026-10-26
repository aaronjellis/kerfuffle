import type { DisplayUnit } from '../engine/types';

/** How a number field shows its value: the unit, the decimals, the bounds. */
export interface DraftUnit {
  displayUnit?: DisplayUnit;
  inDecimals?: number;
  mmDecimals?: number;
  /** A unitless whole count (divider columns, rows). */
  isRawCount?: boolean;
  minMm?: number;
  maxMm?: number;
}

const isInchMode = (u: DraftUnit) => !u.isRawCount && u.displayUnit === 'in';

/** The text a field shows for a value in millimeters (or a raw count). */
export function formatFromMm(mm: number, u: DraftUnit): string {
  if (u.isRawCount) return String(Math.round(mm));
  const v = isInchMode(u) ? Number((mm / 25.4).toFixed(u.inDecimals ?? 2)) : Number(mm.toFixed(u.mmDecimals ?? 1));
  return String(v);
}

/** A typed display value back to millimeters (or a raw count). */
export function toMm(displayVal: number, u: DraftUnit): number {
  if (u.isRawCount) return Math.round(displayVal);
  return isInchMode(u) ? Number((displayVal * 25.4).toFixed(3)) : displayVal;
}

/**
 * What a field commits on blur or Enter: the new value in millimeters, clamped to its bounds,
 * or `null` when there is nothing to commit. Nothing to commit means the draft is blank, is not
 * a number, or still reads exactly as the current value does (focus and blur without an edit).
 */
export function parseDraft(draft: string, valueMm: number, u: DraftUnit): number | null {
  const trimmed = draft.trim();
  if (trimmed === '' || trimmed === formatFromMm(valueMm, u)) return null;
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) return null;
  const mm = toMm(parsed, u);
  return Math.max(u.minMm ?? -Infinity, Math.min(u.maxMm ?? Infinity, mm));
}
