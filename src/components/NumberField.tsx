import React, { useEffect, useState } from 'react';
import { DisplayUnit } from '../engine/types';

interface NumberFieldProps {
  /** Current value in millimeters (or raw count when isRawCount is true) */
  valueMm: number;
  /** Minimum allowed value in millimeters (or raw count) */
  minMm?: number;
  /** Maximum allowed value in millimeters (or raw count) */
  maxMm?: number;
  /** Step size in display units (optional) */
  step?: number;
  /** Current display unit ('mm' | 'in') */
  displayUnit?: DisplayUnit;
  /** Decimal places when displaying in inches */
  inDecimals?: number;
  /** Decimal places when displaying in millimeters */
  mmDecimals?: number;
  /** Set true for unitless integer counts (e.g. divider columns/rows) */
  isRawCount?: boolean;
  /** Callback with new value in millimeters (or raw count) */
  onChangeMm: (nextMm: number) => void;
  className?: string;
  ariaLabel?: string;
}

export const NumberField: React.FC<NumberFieldProps> = ({
  valueMm,
  minMm = -Infinity,
  maxMm = Infinity,
  step = 1,
  displayUnit = 'mm',
  inDecimals = 2,
  mmDecimals = 1,
  isRawCount = false,
  onChangeMm,
  className,
  ariaLabel,
}) => {
  const isInch = !isRawCount && displayUnit === 'in';

  const formatFromMm = (mm: number): string => {
    if (isRawCount) return String(Math.round(mm));
    const v = isInch
      ? Number((mm / 25.4).toFixed(inDecimals))
      : Number(mm.toFixed(mmDecimals));
    return String(v);
  };

  const toMm = (displayVal: number): number => {
    if (isRawCount) return Math.round(displayVal);
    return isInch ? Number((displayVal * 25.4).toFixed(3)) : displayVal;
  };

  const [draft, setDraft] = useState<string>(() => formatFromMm(valueMm));
  const [isFocused, setIsFocused] = useState<boolean>(false);

  // Keep draft synced with external changes (slider drag, unit toggle, preset change) whenever not actively typing
  useEffect(() => {
    if (!isFocused) {
      setDraft(formatFromMm(valueMm));
    }
  }, [valueMm, displayUnit, isFocused, isRawCount, inDecimals, mmDecimals]);

  const commitDraft = (raw: string) => {
    const trimmed = raw.trim();
    const parsed = Number(trimmed);
    if (trimmed === '' || Number.isNaN(parsed)) {
      setDraft(formatFromMm(valueMm));
      return;
    }
    const mm = toMm(parsed);
    const clampedMm = Math.max(minMm, Math.min(maxMm, mm));
    onChangeMm(clampedMm);
    setDraft(formatFromMm(clampedMm));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setDraft(next);

    // Live-update the model only when the intermediate typed number is valid AND already within [minMm, maxMm]
    // so typing "1" on the way to "199" or "3" on the way to "30" never clamps or overwrites your keystrokes!
    const trimmed = next.trim();
    if (
      trimmed !== '' &&
      trimmed !== '-' &&
      !trimmed.endsWith('.') &&
      !trimmed.endsWith('.0')
    ) {
      const parsed = Number(trimmed);
      if (!Number.isNaN(parsed)) {
        const mm = toMm(parsed);
        if (mm >= minMm && mm <= maxMm) {
          onChangeMm(mm);
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setDraft(formatFromMm(valueMm));
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const currentDisplay = Number(draft);
      const baseDisplay = Number.isNaN(currentDisplay)
        ? Number(formatFromMm(valueMm))
        : currentDisplay;
      const nextDisplay = baseDisplay + dir * step;
      const nextMm = Math.max(minMm, Math.min(maxMm, toMm(nextDisplay)));
      onChangeMm(nextMm);
      setDraft(formatFromMm(nextMm));
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className || 'num-field'}
      aria-label={ariaLabel}
      value={draft}
      onFocus={(e) => {
        setIsFocused(true);
        e.currentTarget.select();
      }}
      onBlur={() => {
        setIsFocused(false);
        commitDraft(draft);
      }}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  );
};
