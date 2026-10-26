import React, { useId } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { BoxCategory, BoxTemplateId } from '../engine/types';
import { BOX_TEMPLATES } from '../engine/presets';
import { Popover, usePopover } from './Popover';

interface TemplatePopoverProps {
  category: BoxCategory;
  templateId: BoxTemplateId;
  onSelectTemplate: (id: BoxTemplateId) => void;
}

/** The inspector's title: the current template, opening a list of this category's templates. */
export const TemplatePopover: React.FC<TemplatePopoverProps> = ({ category, templateId, onSelectTemplate }) => {
  const { anchorRef, open, close, toggle } = usePopover<HTMLButtonElement>();
  const popId = useId();
  const current = BOX_TEMPLATES.find((t) => t.id === templateId) ?? BOX_TEMPLATES[0];
  const templates = BOX_TEMPLATES.filter((t) => t.category === category);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="template-switch"
        aria-label="Choose a template"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={toggle}
      >
        <span className="template-switch-name">{current.shortName}</span>
        <ChevronDown size={18} strokeWidth={1.75} className="icon" aria-hidden="true" />
      </button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        id={popId}
        ariaLabel="Templates"
        className="template-menu"
      >
        <div className="template-list">
          {templates.map((t) => {
            const isCurrent = t.id === templateId;
            return (
              <button
                key={t.id}
                type="button"
                className="pop-item"
                aria-current={isCurrent ? 'true' : undefined}
                data-ph-capture-attribute-template={t.id}
                onClick={() => {
                  onSelectTemplate(t.id);
                  close();
                }}
              >
                <span className="pop-item-text">
                  <span className="pop-item-name">{t.name}</span>
                  <span className="pop-item-meta pop-item-wrap">{t.description}</span>
                </span>
                {isCurrent && <Check size={18} strokeWidth={1.75} className="pop-item-check" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
};
