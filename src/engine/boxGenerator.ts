import { shareCutEdges } from './sharedCuts';
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
import { applyFacePatterns, resolvePatternFaces } from './facePatterns';

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
  const { summary, outerDims } = res;

  const patternTargets = resolvePatternFaces(res.panels2D, res.panels3D, params);
  const patterned = applyFacePatterns(res.panels2D, res.panels3D, params, patternTargets);
  const panels3D = patterned.panels3D;
  const panels2D = applyFaceLabelsAndVectorScores(patterned.panels2D, params);

  return assembleModel(params, inner, outerDims, panels2D, panels3D, summary, patternTargets.map((t) => t.faceId));
}

/** Nests the pieces on the bed and totals the cut and score lengths. */
export function assembleModel(
  params: BoxParameters,
  inner: BoxDims,
  outerDims: BoxDims,
  panels2D: BoxPanel2D[],
  panels3D: Panel3DTransform[],
  summary: string,
  patternFaceIds: string[]
): GeneratedBoxModel {
  const bedPreset =
    MACHINE_BED_PRESETS.find((b) => b.id === params.bedPresetId) || MACHINE_BED_PRESETS[0];

  // Common-line cutting packs wood pieces edge to edge; cardboard sheets are single pieces.
  const share = params.shareCutLines && params.category === 'wood-finger';
  const nested = nestPanelsOnSheet(
    panels2D,
    bedPreset.widthMm,
    bedPreset.heightMm,
    params.sheetMarginMm,
    share ? 0 : params.partSpacingMm,
    share
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
    patternFaceIds,
    sheetWidthMm: nested.sheetWidthMm,
    sheetHeightMm: nested.sheetHeightMm,
    fitsOnBed,
    stats: {
      totalCutLengthMm: Math.round(totalCutLengthMm),
      totalScoreLengthMm: Math.round(totalScoreLengthMm),
      sharedCutMm: Math.round(nested.sharedCutMm),
      panelCount: nested.panels.length,
      fingerCountSummary: summary,
    },
  };
}

/**
 * Lays the panels out on the sheet within the bed's width. Each order tried (tallest first, largest
 * first, widest first, as generated) is packed skyline-fashion: every panel drops to the lowest spot
 * across the bed it fits, leftmost on a tie. The layout that fits the bed wins; failing that, the
 * shortest one. Panels keep their order in the list; only their places change.
 */
function nestPanelsOnSheet(
  panels: BoxPanel2D[],
  targetBedWidthMm: number,
  targetBedHeightMm: number,
  marginMm: number,
  spacingMm: number,
  share = false
): { panels: BoxPanel2D[]; sheetWidthMm: number; sheetHeightMm: number; sharedCutMm: number } {
  const indices = panels.map((_, i) => i);
  const orders = [
    [...indices].sort((a, b) => panels[b].heightMm - panels[a].heightMm || panels[b].widthMm - panels[a].widthMm),
    [...indices].sort((a, b) => panels[b].widthMm * panels[b].heightMm - panels[a].widthMm * panels[a].heightMm),
    [...indices].sort((a, b) => panels[b].widthMm - panels[a].widthMm || panels[b].heightMm - panels[a].heightMm),
    indices,
  ];
  type Layout = ReturnType<typeof skylinePack> & { sharedCutMm: number };
  let best: Layout | null = null;
  const fits = (l: Layout) => l.sheetWidthMm <= targetBedWidthMm + 0.01 && l.sheetHeightMm <= targetBedHeightMm + 0.01;
  for (const order of orders) {
    const packed = skylinePack(panels, order, targetBedWidthMm, marginMm, spacingMm);
    const layout: Layout = share
      ? (() => {
          const shared = shareCutEdges(packed.panels);
          return { ...packed, panels: shared.panels, sharedCutMm: shared.savedMm };
        })()
      : { ...packed, sharedCutMm: 0 };
    // Fitting the bed comes first; then, sharing, the most edge cut once; then the shortest sheet.
    const better =
      !best ||
      (fits(layout) && !fits(best)) ||
      (fits(layout) === fits(best) &&
        (layout.sharedCutMm > best.sharedCutMm + 1e-6 ||
          (Math.abs(layout.sharedCutMm - best.sharedCutMm) <= 1e-6 &&
            (layout.sheetHeightMm < best.sheetHeightMm - 1e-6 ||
              (Math.abs(layout.sheetHeightMm - best.sheetHeightMm) < 1e-6 && layout.sheetWidthMm < best.sheetWidthMm - 1e-6)))));
    if (better) best = layout;
  }
  return best!;
}

/** One skyline packing of `panels` taken in `order`; see `nestPanelsOnSheet`. */
function skylinePack(
  panels: BoxPanel2D[],
  order: number[],
  targetBedWidthMm: number,
  marginMm: number,
  spacingMm: number
): { panels: BoxPanel2D[]; sheetWidthMm: number; sheetHeightMm: number } {
  const left = marginMm;
  const right = Math.max(targetBedWidthMm - marginMm, left + Math.max(0, ...panels.map((p) => p.widthMm)));
  // The skyline: the height already used above each stretch of the sheet, left to right.
  let sky: { x: number; w: number; y: number }[] = [{ x: left, w: right - left, y: marginMm }];
  const placed: BoxPanel2D[] = [...panels];
  let maxX = 0;
  let maxY = 0;

  for (const i of order) {
    const panel = panels[i];
    let bestX = left;
    let bestY = Infinity;
    for (let s = 0; s < sky.length; s++) {
      const x = sky[s].x;
      if (x + panel.widthMm > right + 1e-6) break;
      // The panel rests on the highest stretch it spans.
      let y = 0;
      for (let t = s; t < sky.length && sky[t].x < x + panel.widthMm - 1e-6; t++) y = Math.max(y, sky[t].y);
      if (y < bestY - 1e-6) {
        bestY = y;
        bestX = x;
      }
    }
    if (bestY === Infinity) bestY = Math.max(...sky.map((seg) => seg.y));

    placed[i] = { ...panel, sheetX: bestX, sheetY: bestY };
    maxX = Math.max(maxX, bestX + panel.widthMm);
    maxY = Math.max(maxY, bestY + panel.heightMm);

    // Raise the skyline under the panel and its spacing.
    const x0 = bestX;
    const x1 = Math.min(right, bestX + panel.widthMm + spacingMm);
    const top = bestY + panel.heightMm + spacingMm;
    const next: typeof sky = [];
    for (const seg of sky) {
      const a = seg.x;
      const b = seg.x + seg.w;
      if (b <= x0 + 1e-9 || a >= x1 - 1e-9) {
        next.push(seg);
        continue;
      }
      if (a < x0) next.push({ x: a, w: x0 - a, y: seg.y });
      if (b > x1) next.push({ x: x1, w: b - x1, y: seg.y });
    }
    next.push({ x: x0, w: x1 - x0, y: top });
    next.sort((p, q) => p.x - q.x);
    // Merge neighbours at the same height.
    sky = next.reduce<typeof sky>((acc, seg) => {
      const last = acc[acc.length - 1];
      if (last && Math.abs(last.y - seg.y) < 1e-9 && Math.abs(last.x + last.w - seg.x) < 1e-9) last.w += seg.w;
      else acc.push({ ...seg });
      return acc;
    }, []);
  }

  return {
    panels: placed,
    sheetWidthMm: Math.max(marginMm * 2, maxX + marginMm),
    sheetHeightMm: Math.max(marginMm * 2, maxY + marginMm),
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
