import React from 'react';
import { Box, Hammer, Package } from 'lucide-react';
import type { BoxCategory, DisplayUnit } from '../engine/types';
import { Segmented } from './Field';
import { ExportMenu, type ExportMenuProps } from './ExportMenu';
import { ProjectMenu, type ProjectMenuProps } from './ProjectMenu';

interface AppBarProps {
  category: BoxCategory;
  onSelectCategory: (category: BoxCategory) => void;
  displayUnit: DisplayUnit;
  onSelectUnit: (unit: DisplayUnit) => void;
  exportMenu: ExportMenuProps;
  projectMenu: ProjectMenuProps;
}

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** Wordmark and Project menu, the three categories (icons only on a narrow phone), units, and Export. */
export const AppBar: React.FC<AppBarProps> = ({
  category,
  onSelectCategory,
  displayUnit,
  onSelectUnit,
  exportMenu,
  projectMenu,
}) => (
  <header className="app-bar">
    <div className="app-brand">
      <Box {...ICON} className="app-brand-icon" />
      <span className="app-wordmark">Kerfuffle</span>
      <ProjectMenu {...projectMenu} />
    </div>

    <div className="app-bar-center">
      <Segmented<BoxCategory>
        ariaLabel="Box category"
        value={category}
        onChange={onSelectCategory}
        options={[
          { value: 'wood-finger', title: 'Wood', label: <><Hammer {...ICON} /><span className="seg-label">Wood</span></> },
          { value: 'cardboard-fold', title: 'Cardboard', label: <><Package {...ICON} /><span className="seg-label">Cardboard</span></> },
          { value: '3d-print', title: '3D print', label: <><Box {...ICON} /><span className="seg-label">3D print</span></> },
        ]}
      />
    </div>

    <div className="app-bar-end">
      {/* On a phone the units live in the Size section only. */}
      <div className="app-bar-units">
        <Segmented<DisplayUnit>
          ariaLabel="Units"
          value={displayUnit}
          onChange={onSelectUnit}
          options={[
            { value: 'mm', label: 'mm' },
            { value: 'in', label: 'in' },
          ]}
        />
      </div>
      <ExportMenu {...exportMenu} />
    </div>
  </header>
);
