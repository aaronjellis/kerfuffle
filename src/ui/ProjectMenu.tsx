import React, { useId } from 'react';
import { ChevronDown, FilePlus, Folder, FolderOpen, Save } from 'lucide-react';
import { Popover, usePopover } from './Popover';

export interface ProjectMenuProps {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  /** The current box has changes that aren't in a saved file. */
  unsaved: boolean;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

/** New, open and save a `.kerf` project. */
export const ProjectMenu: React.FC<ProjectMenuProps> = ({ onNew, onOpen, onSave, unsaved }) => {
  const { anchorRef, open, close, toggle } = usePopover<HTMLButtonElement>();
  const popId = useId();
  const items = [
    { id: 'new', label: 'New project', hint: 'Start over from the default box', icon: FilePlus, run: onNew },
    { id: 'open', label: 'Open…', hint: `A .kerf project file · ${MOD}O`, icon: FolderOpen, run: onOpen },
    { id: 'save', label: 'Save as .kerf', hint: `Box, artwork and units · ${MOD}S`, icon: Save, run: onSave },
  ];
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="btn btn-sm project-menu-btn"
        aria-label={unsaved ? 'Project, unsaved changes' : 'Project'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={toggle}
      >
        <Folder size={16} strokeWidth={1.75} className="project-menu-icon" aria-hidden="true" />
        <span className="seg-label">Project</span>
        {unsaved && <span className="unsaved-dot" title="Unsaved changes" />}
        <ChevronDown size={16} strokeWidth={1.75} className="btn-caret" aria-hidden="true" />
      </button>
      <Popover open={open} onClose={close} anchorRef={anchorRef} id={popId} ariaLabel="Project" className="export-menu">
        <div className="export-formats">
          {items.map(({ id, label, hint, icon: Icon, run }) => (
            <button
              key={id}
              type="button"
              className="pop-item"
              data-ph-capture-attribute-project-action={id}
              onClick={() => {
                close(false);
                run();
              }}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className="pop-item-text">
                <span className="pop-item-name">{label}</span>
                <span className="pop-item-meta">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
};
