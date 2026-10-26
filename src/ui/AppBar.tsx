import React from 'react';
import { Box, Hammer, Package } from 'lucide-react';
import type { BoxCategory, DisplayUnit } from '../engine/types';
import { Segmented } from './Field';
import { ExportMenu, type ExportMenuProps } from './ExportMenu';

interface AppBarProps {
  category: BoxCategory;
  onSelectCategory: (category: BoxCategory) => void;
  displayUnit: DisplayUnit;
  onSelectUnit: (unit: DisplayUnit) => void;
  exportMenu: ExportMenuProps;
}

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** Wordmark, the three categories, units, and Export. */
export const AppBar: React.FC<AppBarProps> = ({
  category,
  onSelectCategory,
  displayUnit,
  onSelectUnit,
  exportMenu,
}) => (
  <header className="app-bar">
    <div className="app-brand">
      <Box {...ICON} className="app-brand-icon" />
      <span className="app-wordmark">Kerfuffle</span>
    </div>

    <div className="app-bar-center">
      <Segmented<BoxCategory>
        ariaLabel="Box category"
        value={category}
        onChange={onSelectCategory}
        options={[
          { value: 'wood-finger', label: <><Hammer {...ICON} /><span>Wood</span></> },
          { value: 'cardboard-fold', label: <><Package {...ICON} /><span>Cardboard</span></> },
          { value: '3d-print', label: <><Box {...ICON} /><span>3D print</span></> },
        ]}
      />
    </div>

    <div className="app-bar-end">
      <Segmented<DisplayUnit>
        ariaLabel="Units"
        value={displayUnit}
        onChange={onSelectUnit}
        options={[
          { value: 'mm', label: 'mm' },
          { value: 'in', label: 'in' },
        ]}
      />
      <ExportMenu {...exportMenu} />
    </div>
  </header>
);
