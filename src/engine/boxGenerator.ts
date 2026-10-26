import {
  BoxDims,
  BoxPanel2D,
  BoxParameters,
  GeneratedBoxModel,
  Panel3DTransform,
} from './types';
import { DEFAULT_FACE_LABELS, MACHINE_BED_PRESETS } from './presets';
import { fmt, generateWoodFingerBox } from './fingerJointEngine';
import { generateCardboardBox } from './cardboardEngine';
import { generate3DPrintBox } from './print3dEngine';
import { buildSingleStrokeTextPath } from './vectorFont';

function resolveCustomPanelLabel(panelId: string, defaultLabel: string, customMap: Record<string, string>): string {
  if (panelId in customMap) {
    return customMap[panelId];
  }
  if (panelId.startsWith('base-')) {
    const subKey = panelId.slice(5);
    if (subKey in customMap) {
      const baseText = customMap[subKey].trim();
      return baseText ? `BASE ${baseText}` : '';
    }
  }
  if (panelId.startsWith('lid-')) {
    const subKey = panelId.slice(4);
    if (subKey in customMap) {
      const lidText = customMap[subKey].trim();
      return lidText ? `LID ${lidText}` : '';
    }
  }
  return defaultLabel;
}

function applyFaceLabelsAndVectorScores(
  panels: BoxPanel2D[],
  params: BoxParameters
): BoxPanel2D[] {
  const customMap = { ...DEFAULT_FACE_LABELS, ...(params.customFaceLabels || {}) };
  const capH = Math.max(2.0, Math.min(25, params.faceLabelSizeMm || 5.0));
  const posMode = params.faceLabelPosition || 'center';
  const mirrorX = Boolean(params.mirrorInnerFaceLabels);
  const withDims = Boolean(params.scoreFaceDimensions);

  const computeAnchor = (
    rect: { x: number; y: number; width: number; height: number },
    lineCount: number
  ): { cx: number; cy: number; maxW: number } => {
    const pad = Math.max(3.5, capH * 0.85);
    const blockH = lineCount * capH + Math.max(0, lineCount - 1) * (capH * 0.45);
    const maxW = Math.max(8, rect.width - 2 * pad);
    if (posMode === 'bottom') {
      return {
        cx: rect.x + rect.width / 2,
        cy: rect.y + rect.height - pad - blockH / 2,
        maxW,
      };
    }
    if (posMode === 'top-left') {
      return {
        cx: rect.x + rect.width / 2,
        cy: rect.y + pad + blockH / 2,
        maxW,
      };
    }
    return {
      cx: rect.x + rect.width / 2,
      cy: rect.y + rect.height / 2,
      maxW,
    };
  };

  return panels.map((panel) => {
    const updatedSubFaces = panel.subFaces?.map((sf) => {
      const resolved = sf.id in customMap ? customMap[sf.id] : sf.name;
      return {
        ...sf,
        name: resolved,
      };
    });

    const resolvedPanelLabel = resolveCustomPanelLabel(panel.id, panel.faceLabel, customMap);
    const nextPaths = [...panel.paths];

    if (params.scoreInnerFaceLabels) {
      if (updatedSubFaces && updatedSubFaces.length > 0) {
        // Score each individual face inside a 1-piece folding cardboard blank
        for (const sf of updatedSubFaces) {
          const text = sf.name.trim();
          if (!text) continue;
          const lines = [text];
          if (withDims) {
            lines.push(`${fmt(sf.width)}×${fmt(sf.height)}MM`);
          }
          const { cx, cy, maxW } = computeAnchor(sf, lines.length);
          const d = buildSingleStrokeTextPath(lines, {
            centerX: cx,
            centerY: cy,
            capHeightMm: capH,
            maxWidthMm: maxW,
            mirrorX,
          });
          if (d) {
            nextPaths.push({
              id: `${panel.id}-label-score-${sf.id}`,
              layer: 'score',
              d,
              closed: false,
            });
          }
        }
      } else {
        const text = resolvedPanelLabel.trim();
        if (text) {
          const lines = [text];
          if (withDims) {
            lines.push(`${fmt(panel.widthMm)}×${fmt(panel.heightMm)}MM`);
          }
          // For living-hinge wrap lids, place the label on the lower back wall or front lid safe zone away from the kerf lattice
          const targetRect =
            panel.id === 'top' && params.templateId === 'finger-living-hinge'
              ? {
                  x: panel.safeRect.x,
                  y: Math.max(panel.safeRect.y, panel.heightMm - Math.min(36, panel.heightMm * 0.25)),
                  width: panel.safeRect.width,
                  height: Math.min(30, panel.heightMm * 0.22),
                }
              : panel.safeRect;
          const { cx, cy, maxW } = computeAnchor(targetRect, lines.length);
          const d = buildSingleStrokeTextPath(lines, {
            centerX: cx,
            centerY: cy,
            capHeightMm: capH,
            maxWidthMm: maxW,
            mirrorX,
          });
          if (d) {
            nextPaths.push({
              id: `${panel.id}-label-score`,
              layer: 'score',
              d,
              closed: false,
            });
          }
        }
      }
    }

    return {
      ...panel,
      faceLabel: resolvedPanelLabel,
      subFaces: updatedSubFaces,
      paths: nextPaths,
    };
  });
}

/** Runs the template's generator for an inner size. */
function generateForInner(
  params: BoxParameters,
  inner: BoxDims
): { panels2D: BoxPanel2D[]; panels3D: Panel3DTransform[]; summary: string; outerDims: BoxDims } {
  const { widthMm: w, depthMm: d, heightMm: h } = inner;
  if (params.category === 'wood-finger') {
    const res = generateWoodFingerBox(params, w, d, h);
    return { ...res, summary: res.fingerCountSummary };
  }
  if (params.category === 'cardboard-fold') return generateCardboardBox(params, w, d, h);
  return generate3DPrintBox(params, w, d, h);
}

export function generateBoxModel(params: BoxParameters): GeneratedBoxModel {
  const MIN_INNER_MM = 15;
  const typed: BoxDims = {
    widthMm: Math.max(MIN_INNER_MM, params.widthMm),
    depthMm: Math.max(MIN_INNER_MM, params.depthMm),
    heightMm: Math.max(MIN_INNER_MM, params.heightMm),
  };

  let inner = typed;
  let res = generateForInner(params, typed);
  if (params.dimensionReference !== 'inner') {
    // Each template's outside size is its inner size plus a fixed allowance, so one run with the
    // typed size as inner gives the allowance, and a second run cuts the box that has that outside size.
    const allowance = (k: keyof BoxDims) => res.outerDims[k] - typed[k];
    inner = {
      widthMm: Math.max(MIN_INNER_MM, params.widthMm - allowance('widthMm')),
      depthMm: Math.max(MIN_INNER_MM, params.depthMm - allowance('depthMm')),
      heightMm: Math.max(MIN_INNER_MM, params.heightMm - allowance('heightMm')),
    };
    res = generateForInner(params, inner);
  }
  const { panels3D, summary, outerDims } = res;

  const panels2D = applyFaceLabelsAndVectorScores(res.panels2D, params);

  const bedPreset =
    MACHINE_BED_PRESETS.find((b) => b.id === params.bedPresetId) || MACHINE_BED_PRESETS[0];

  const nested = nestPanelsOnSheet(
    panels2D,
    bedPreset.widthMm,
    params.sheetMarginMm,
    params.partSpacingMm
  );

  const fitsOnBed =
    nested.sheetWidthMm <= bedPreset.widthMm + 0.01 &&
    nested.sheetHeightMm <= bedPreset.heightMm + 0.01;

  // Approximate path lengths for laser cut / score estimation
  let totalCutLengthMm = 0;
  let totalScoreLengthMm = 0;
  for (const p of nested.panels) {
    for (const path of p.paths) {
      const approxLen = estimateSvgPathLength(path.d);
      if (path.layer === 'cut') totalCutLengthMm += approxLen;
      if (path.layer === 'score') totalScoreLengthMm += approxLen;
    }
  }

  return {
    params,
    innerDims: inner,
    outerDims,
    panels2D: nested.panels,
    panels3D,
    sheetWidthMm: nested.sheetWidthMm,
    sheetHeightMm: nested.sheetHeightMm,
    fitsOnBed,
    stats: {
      totalCutLengthMm: Math.round(totalCutLengthMm),
      totalScoreLengthMm: Math.round(totalScoreLengthMm),
      panelCount: nested.panels.length,
      fingerCountSummary: summary,
    },
  };
}

function nestPanelsOnSheet(
  panels: BoxPanel2D[],
  targetBedWidthMm: number,
  marginMm: number,
  spacingMm: number
): { panels: BoxPanel2D[]; sheetWidthMm: number; sheetHeightMm: number } {
  let cursorX = marginMm;
  let cursorY = marginMm;
  let rowHeight = 0;
  let maxX = 0;

  const maxRowWidth = Math.max(
    targetBedWidthMm,
    ...panels.map((p) => p.widthMm + 2 * marginMm)
  );

  const laidOut = panels.map((panel) => {
    if (cursorX > marginMm && cursorX + panel.widthMm + marginMm > maxRowWidth) {
      cursorX = marginMm;
      cursorY += rowHeight + spacingMm;
      rowHeight = 0;
    }

    const placed: BoxPanel2D = {
      ...panel,
      sheetX: cursorX,
      sheetY: cursorY,
    };

    cursorX += panel.widthMm + spacingMm;
    rowHeight = Math.max(rowHeight, panel.heightMm);
    maxX = Math.max(maxX, placed.sheetX + panel.widthMm);
    return placed;
  });

  const sheetWidthMm = Math.max(marginMm * 2, maxX + marginMm);
  const sheetHeightMm = Math.max(marginMm * 2, cursorY + rowHeight + marginMm);

  return {
    panels: laidOut,
    sheetWidthMm,
    sheetHeightMm,
  };
}

function estimateSvgPathLength(d: string): number {
  const tokens = d.match(/[MLZ]|-?\d+(\.\d+)?/g);
  if (!tokens) return 0;
  let len = 0;
  let startX = 0;
  let startY = 0;
  let currX = 0;
  let currY = 0;
  let hasStart = false;
  let i = 0;

  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === 'M') {
      const x = parseFloat(tokens[i + 1] || '0');
      const y = parseFloat(tokens[i + 2] || '0');
      currX = x;
      currY = y;
      startX = x;
      startY = y;
      hasStart = true;
      i += 3;
    } else if (cmd === 'L') {
      const x = parseFloat(tokens[i + 1] || '0');
      const y = parseFloat(tokens[i + 2] || '0');
      if (hasStart) {
        len += Math.hypot(x - currX, y - currY);
      }
      currX = x;
      currY = y;
      i += 3;
    } else if (cmd === 'Z') {
      if (hasStart) {
        len += Math.hypot(startX - currX, startY - currY);
      }
      currX = startX;
      currY = startY;
      i += 1;
    } else {
      i += 1;
    }
  }
  return len;
}
