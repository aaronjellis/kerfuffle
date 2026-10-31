import { describe, expect, it } from 'vitest';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { exportBoxSvg } from '../src/engine/exporters';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { ExportProfileId, SvgGroupingMode } from '../src/engine/types';

const svgFor = (exportProfile: ExportProfileId, svgGroupingMode: SvgGroupingMode) =>
  exportBoxSvg(
    generateBoxModel({ ...DEFAULT_BOX_PARAMETERS, exportProfile, svgGroupingMode, scoreInnerFaceLabels: true }),
    [],
  );
const paths = (svg: string) => [...svg.matchAll(/<path [^>]*>/g)].map((m) => m[0]);

describe('processing-type tags', () => {
  it.each(['by-piece', 'by-layer', 'flat-2-objects'] as const)(
    'mark every xTool Studio cut as cutting and every score as line engraving (%s)',
    (grouping) => {
      const svg = svgFor('xtool-studio', grouping);
      const cut = paths(svg).filter((p) => p.includes('stroke="#FF0000"'));
      const score = paths(svg).filter((p) => p.includes('stroke="#0000FF"'));
      expect(cut.length).toBeGreaterThan(0);
      expect(score.length).toBeGreaterThan(0);
      expect(cut.every((p) => p.includes('data-processing-type="VECTOR_CUTTING"'))).toBe(true);
      expect(score.every((p) => p.includes('data-processing-type="VECTOR_ENGRAVING"'))).toBe(true);
    },
  );

  it('leaves other software’s files untagged', () => {
    for (const profile of ['lightburn', 'illustrator', 'glowforge'] as const) {
      expect(svgFor(profile, 'by-piece')).not.toContain('data-processing-type');
    }
  });
});
