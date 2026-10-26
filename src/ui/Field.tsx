import React, { useId, useRef } from 'react';

interface FieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  /**
   * Set when the child is a group of buttons (a `Segmented`, a button row, a select with a
   * toggle beside it): the field becomes a labeled group instead of a `<label>`, which may
   * hold only one control.
   */
  group?: boolean;
  children: React.ReactNode;
}

/** A labeled control: the label above, the control below, an optional hint under it. */
export const Field: React.FC<FieldProps> = ({ label, hint, group, children }) => {
  const labelId = useId();
  if (group) {
    return (
      <div className="field" role="group" aria-labelledby={labelId}>
        <span className="field-label" id={labelId}>
          {label}
        </span>
        {children}
        {hint && <small className="field-hint">{hint}</small>}
      </div>
    );
  }
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
};

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
}

/** An on/off toggle: a real `button[role=switch]` with its label on the left. */
export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    className="switch-row"
    disabled={disabled}
    onClick={() => onChange(!checked)}
  >
    <span>{label}</span>
    <span className="switch-track" aria-hidden="true">
      <span className="switch-thumb" />
    </span>
  </button>
);

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Tooltip and accessible name, for icon-only options. */
  title?: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  style?: React.CSSProperties;
}

/** A small set of mutually exclusive choices, with radio-group semantics and arrow-key movement. */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel, style }: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  const anyActive = options.some((o) => o.value === value);
  return (
    <div className="segmented-toggle" role="radiogroup" aria-label={ariaLabel} style={style}>
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.title}
            title={opt.title}
            tabIndex={active || (!anyActive && i === 0) ? 0 : -1}
            className={active ? 'active' : ''}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(i, -1);
              }
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
