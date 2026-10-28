import React, { useId } from 'react';
import { Check } from 'lucide-react';
import type { BoxCategory } from '../engine/types';
import { BOX_TYPES, boxTypeCategory, boxTypeThumb, CATEGORY_NAMES, type BoxType } from './boxTypes';
import { Popover, usePopover } from './Popover';

interface BoxTypePickerProps {
  current: BoxType | undefined;
  onSelect: (t: BoxType) => void;
}

/** A box type as a small isometric drawing of the assembled box. */
const Thumb: React.FC<{ type: BoxType; className: string }> = ({ type, className }) => {
  const thumb = boxTypeThumb(type);
  return (
    <svg className={className} viewBox={thumb.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {thumb.faces.map((d, i) => (
        <path key={i} d={d} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
};

const CATEGORIES: BoxCategory[] = ['wood-finger', 'cardboard-fold', '3d-print'];

/**
 * The inspector's first step: the box being made, as a card with its sheet, opening a gallery of
 * every box type across the three categories.
 */
export const BoxTypePicker: React.FC<BoxTypePickerProps> = ({ current, onSelect }) => {
  const { anchorRef, open, close, toggle } = usePopover<HTMLButtonElement>();
  const popId = useId();
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="box-type-card"
        aria-label={`Box type: ${current?.name ?? 'choose'}. Change`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={toggle}
      >
        {current && <Thumb type={current} className="box-type-card-thumb" />}
        <span className="box-type-card-text">
          <span className="box-type-card-label">Box type</span>
          <span className="box-type-card-name">{current?.name ?? 'Choose a box'}</span>
        </span>
        <span className="box-type-card-change">Change</span>
      </button>
      <Popover open={open} onClose={close} anchorRef={anchorRef} id={popId} ariaLabel="Box types" className="box-type-menu">
        {CATEGORIES.map((cat) => (
          <section key={cat} className="box-type-group" aria-label={CATEGORY_NAMES[cat]}>
            <h3 className="box-type-group-title">{CATEGORY_NAMES[cat]}</h3>
            <div className="box-type-grid">
              {BOX_TYPES.filter((t) => boxTypeCategory(t) === cat).map((t) => {
                const isCurrent = t.id === current?.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="box-type-tile"
                    aria-current={isCurrent ? 'true' : undefined}
                    data-ph-capture-attribute-box-type={t.id}
                    onClick={() => {
                      onSelect(t);
                      close();
                    }}
                  >
                    <Thumb type={t} className="box-type-tile-thumb" />
                    <span className="box-type-tile-name">
                      {t.name}
                      {isCurrent && <Check size={14} strokeWidth={2} aria-hidden="true" />}
                    </span>
                    <span className="box-type-tile-blurb">{t.blurb}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </Popover>
    </>
  );
};
