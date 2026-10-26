import React, { useId } from 'react';
import { ChevronDown, Download, FileCode, FileText, Image, Link, Printer, Scissors, type LucideIcon } from 'lucide-react';
import type { BoxParameters, ExportProfileId } from '../engine/types';
import { EXPORT_PROFILES } from '../engine/presets';
import { captureExport } from './analytics';
import { Popover, usePopover } from './Popover';

export interface ExportHandlers {
  svg: () => void;
  splitSvg: () => void;
  pdf: () => Promise<void> | void;
  dxf: () => void;
  xcs: () => void;
  stl: () => void;
  stlParts: () => void;
  hingeStl: () => void;
}

export interface ExportMenuProps {
  params: Pick<BoxParameters, 'templateId' | 'category' | 'exportProfile' | 'clamshellHingeType'>;
  onSelectProfile: (profile: ExportProfileId) => void;
  showXcsExport: boolean;
  isExportingPdf: boolean;
  handlers: ExportHandlers;
}

interface Format {
  format: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  run: () => unknown;
  title?: string;
  busy?: boolean;
}

/** The app bar's one primary action: a target tool, then the formats that apply to this box. */
export const ExportMenu: React.FC<ExportMenuProps> = ({
  params,
  onSelectProfile,
  showXcsExport,
  isExportingPdf,
  handlers,
}) => {
  const { anchorRef, open, close, toggle } = usePopover<HTMLButtonElement>();
  const popId = useId();
  const selectId = useId();
  const is3d = params.category === '3d-print';
  const hasPrintedHinge =
    params.templateId === 'finger-clamshell' && params.clamshellHingeType === 'printed-hinge';

  const formats: Format[] = is3d
    ? [
        { format: 'stl', label: 'STL, one file', hint: 'Base and lid together', icon: Printer, run: handlers.stl },
        {
          format: 'stl-two-files',
          label: 'STL, two files',
          hint: 'Base and lid apart',
          icon: Printer,
          run: handlers.stlParts,
          title: 'Two downloads; allow them if the browser asks',
        },
      ]
    : [
        { format: 'svg', label: 'SVG', hint: 'Cut, score, and artwork layers', icon: Image, run: handlers.svg },
        {
          format: 'svg-split',
          label: 'SVG, cut and score apart',
          hint: 'A cut file and a score file',
          icon: Scissors,
          run: handlers.splitSvg,
          title: 'Two downloads; allow them if the browser asks',
        },
        {
          format: 'pdf',
          label: isExportingPdf ? 'Building PDF…' : 'PDF',
          hint: '1:1 scale, for print then cut',
          icon: FileText,
          run: handlers.pdf,
          busy: isExportingPdf,
        },
        { format: 'dxf', label: 'DXF', hint: 'Millimeters, for LightBurn or CAD', icon: FileCode, run: handlers.dxf },
        ...(showXcsExport
          ? [
              {
                format: 'xcs',
                label: 'xTool project (.xcs) · beta',
                hint: 'Cut and score settings assigned',
                icon: FileCode,
                run: handlers.xcs,
              },
            ]
          : []),
      ];

  if (hasPrintedHinge) {
    formats.push({
      format: 'hinge-stl',
      label: 'Hinge STL (print two)',
      hint: 'The printed hinge leaf',
      icon: Link,
      run: handlers.hingeStl,
    });
  }

  // The PDF builds asynchronously: the popover stays open, its button disabled, until it lands.
  // The event fires only for a download that succeeded.
  const download = async (f: Format) => {
    try {
      await f.run();
    } catch (err) {
      console.error(`Export ${f.format} failed`, err);
      return;
    }
    captureExport(f.format, params.templateId);
    close();
  };

  const profile = EXPORT_PROFILES[params.exportProfile];

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="btn-primary"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={toggle}
      >
        <Download size={18} strokeWidth={1.75} aria-hidden="true" />
        <span>Export</span>
        <ChevronDown size={18} strokeWidth={1.75} className="btn-caret" aria-hidden="true" />
      </button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        id={popId}
        ariaLabel="Export"
        className="export-menu"
      >
        {!is3d && (
          <div className="export-target">
            <label htmlFor={selectId}>Target tool</label>
            <select
              id={selectId}
              className="pop-select"
              value={params.exportProfile}
              onChange={(e) => onSelectProfile(e.target.value as ExportProfileId)}
            >
              {Object.values(EXPORT_PROFILES).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <small className="field-hint">{profile.notes}</small>
          </div>
        )}
        <div className="export-formats">
          {formats.map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.format}
                type="button"
                className="pop-item"
                title={f.title}
                disabled={f.busy}
                data-ph-capture-attribute-format={f.format}
                onClick={() => void download(f)}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                <span className="pop-item-text">
                  <span className="pop-item-name">{f.label}</span>
                  <span className="pop-item-meta">{f.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
};
