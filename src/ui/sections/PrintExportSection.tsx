import React from 'react';
import { Printer } from 'lucide-react';
import type { SectionProps } from './types';

/** 3D box: one STL with both parts, or one file per part. */
export const PrintExportSection: React.FC<SectionProps> = ({ handlers }) => (
  <>
    <div className="two-col-inputs">
      <button type="button" className="export-btn export-btn-3d" onClick={handlers.downloadStl}>
        <Printer size={14} />
        One STL
      </button>
      <button type="button" className="export-btn export-btn-3d" onClick={handlers.downloadStlParts}>
        <Printer size={14} />
        Two STLs
      </button>
    </div>
    <p className="helper-note">
      One STL lays the base and the lid side by side on one bed. Two STLs saves the base and the lid as separate
      files, one download after the other; your browser may ask to allow multiple downloads.
    </p>
  </>
);
