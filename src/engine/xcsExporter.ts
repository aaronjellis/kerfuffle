import { GeneratedBoxModel } from './types';
import { EXPORT_PROFILES } from './presets';
import { translateSvgPath } from './fingerJointEngine';
import { svgPathToPolylines } from './exporters';

/** One PATH shape on an xTool Studio canvas (`canvas[0].displays[]` in a `.xcs` file). */
export interface XcsDisplay {
  id: string;
  type: 'PATH';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dPath: string;
  isClosePath: boolean;
  isCompoundPath: boolean;
  fillRule: 'nonzero';
  groupTag: string;
  groupTags: string[];
  layerTag: string;
  layerColor: string;
  lineColor: number;
  fillColor: string;
  isFill: false;
  angle: 0;
  scale: { x: 1; y: 1 };
  skew: { x: 0; y: 0 };
  pivot: { x: 0; y: 0 };
  localSkew: { x: 0; y: 0 };
  offsetX: number;
  offsetY: number;
  lockRatio: false;
  zOrder: number;
  visible: true;
  visibleState: true;
  lockState: false;
  originColor: string;
  enableTransform: true;
  resourceOrigin: '';
  customData: Record<string, never>;
  rootComponentId: '';
  minCanvasVersion: '0.0.0';
  alpha: 1;
  effects: [];
  points: [];
  graphicX: 0;
  graphicY: 0;
}

export type XcsIdGenerator = () => string;

const randomId: XcsIdGenerator = () => crypto.randomUUID();

/** Rounds to 1/1000 mm so the file stays readable and free of float noise. */
const mm = (n: number) => Math.round(n * 1000) / 1000;

/**
 * One display per cut or score path across every nested panel, in absolute sheet mm.
 * All paths of a panel share one `groupTag`, so each dieline piece selects as a unit in Studio.
 */
export function buildXcsDisplays(
  model: GeneratedBoxModel,
  newId: XcsIdGenerator = randomId
): { displays: XcsDisplay[]; layerOf: Map<string, 'cut' | 'score'> } {
  const profile = EXPORT_PROFILES[model.params.exportProfile];
  const displays: XcsDisplay[] = [];
  const layerOf = new Map<string, 'cut' | 'score'>();
  const groupOf = new Map<string, string>();

  for (const panel of model.panels2D) {
    for (const path of panel.paths) {
      if (path.layer !== 'cut' && path.layer !== 'score') continue;
      const layer = path.layer;
      const dPath = translateSvgPath(path.d, panel.sheetX, panel.sheetY, 1);
      const pts = svgPathToPolylines(dPath, 0, 0).flatMap((p) => p.points);
      if (pts.length === 0) continue;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }

      let groupTag = groupOf.get(panel.id);
      if (!groupTag) {
        groupTag = newId();
        groupOf.set(panel.id, groupTag);
      }

      const color = layer === 'cut' ? profile.cutColor : profile.scoreColor;
      const id = newId();
      const x = mm(minX);
      const y = mm(minY);
      displays.push({
        id,
        type: 'PATH',
        name: `${panel.name} · ${layer}`,
        x,
        y,
        width: mm(maxX - minX),
        height: mm(maxY - minY),
        dPath,
        isClosePath: path.closed,
        isCompoundPath: (dPath.match(/M/g) || []).length > 1,
        fillRule: 'nonzero',
        groupTag,
        groupTags: [groupTag],
        layerTag: color,
        layerColor: color,
        lineColor: parseInt(color.slice(1), 16),
        fillColor: '#777777',
        isFill: false,
        angle: 0,
        scale: { x: 1, y: 1 },
        skew: { x: 0, y: 0 },
        pivot: { x: 0, y: 0 },
        localSkew: { x: 0, y: 0 },
        offsetX: x,
        offsetY: y,
        lockRatio: false,
        zOrder: displays.length,
        visible: true,
        visibleState: true,
        lockState: false,
        originColor: color,
        enableTransform: true,
        resourceOrigin: '',
        customData: {},
        rootComponentId: '',
        minCanvasVersion: '0.0.0',
        alpha: 1,
        effects: [],
        points: [],
        graphicX: 0,
        graphicY: 0,
      });
      layerOf.set(id, layer);
    }
  }

  return { displays, layerOf };
}
