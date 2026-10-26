import React from 'react';
import { Printer } from 'lucide-react';
import { captureExport } from '../analytics';
import type { SectionProps } from './types';

/** 3D box: one STL with both parts, or one file per part. */
export const PrintExportSection: React.FC<SectionProps> = ({ params, handlers }) => (
  <>
    <div className="two-col-inputs">
      <button
        type="button"
        className="btn"
        data-ph-capture-attribute-format="stl"
        onClick={() => {
          handlers.downloadStl();
          captureExport('stl', params.templateId);
        }}
      >
        <Printer size={18} strokeWidth={1.75} aria-hidden="true" />
        One STL
      </button>
      <button
        type="button"
        className="btn"
        data-ph-capture-attribute-format="stl-two-files"
        onClick={() => {
          handlers.downloadStlParts();
          captureExport('stl-two-files', params.templateId);
        }}
      >
        <Printer size={18} strokeWidth={1.75} aria-hidden="true" />
        Two STLs
      </button>
    </div>
    <p className="helper-note">
      One STL lays the base and the lid side by side on one bed. Two STLs saves the base and the lid as separate
      files, one download after the other; your browser may ask to allow multiple downloads.
    </p>
  </>
);
