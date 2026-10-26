import { GeneratedBoxModel } from './types';
import { EXPORT_PROFILES, laserSettingsFor } from './presets';
import { translateSvgPath } from './fingerJointEngine';
import { effectiveLayer, svgPathToPolylines } from './exporters';

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

/**
 * A v4 UUID. `crypto.randomUUID` exists only in secure contexts, so plain-http LAN dev
 * falls back to a `Math.random` v4 UUID. Ids only need to be unique within one project file.
 */
export function uuidV4(cryptoLike: { randomUUID?: () => string } | undefined = globalThis.crypto): string {
  if (typeof cryptoLike?.randomUUID === 'function') return cryptoLike.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const randomId: XcsIdGenerator = () => uuidV4();

/** Rounds to 1/1000 mm so the file stays readable and free of float noise. */
const mm = (n: number) => Math.round(n * 1000) / 1000;

/**
 * One display per cut or score path across every nested panel, in absolute sheet mm.
 * All paths of a panel share one `groupTag`, so each dieline piece selects as a unit in Studio.
 * `cutThrough` holds the score-layer displays that are dashed perforations: they keep the
 * score color but must be processed as cuts.
 */
export function buildXcsDisplays(
  model: GeneratedBoxModel,
  newId: XcsIdGenerator = randomId
): { displays: XcsDisplay[]; layerOf: Map<string, 'cut' | 'score'>; cutThrough: Set<string> } {
  const profile = EXPORT_PROFILES[model.params.exportProfile];
  const displays: XcsDisplay[] = [];
  const layerOf = new Map<string, 'cut' | 'score'>();
  const cutThrough = new Set<string>();
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
      if (layer === 'score' && effectiveLayer(path, model.params) === 'cut') cutThrough.add(id);
    }
  }

  return { displays, layerOf, cutThrough };
}

/** The machine a `.xcs` project targets: written to the envelope and to `device`. */
export interface XcsDeviceTemplate {
  extId: string;
  extName: string;
  deviceId: string;
  power: number;
  /** Extra `device` keys copied from a real Studio file for this machine. */
  extra?: Record<string, unknown>;
}

/** Placeholder until a real M2 sample confirms the identifiers. */
export const XCS_DEVICE_M2: XcsDeviceTemplate = {
  extId: 'M2',
  extName: 'xTool M2',
  deviceId: 'M2-1',
  power: 10,
};

type XcsProcessingType = 'VECTOR_CUTTING' | 'VECTOR_ENGRAVING';

function processingEntry(processingType: XcsProcessingType, power: number, speed: number, repeat: number) {
  return {
    type: 'PATH',
    isFill: false,
    processingType,
    processIgnore: false,
    isWhiteModel: true,
    data: {
      [processingType]: {
        materialType: 'customize',
        planType: 'blue',
        parameter: {
          customize: {
            power,
            speed,
            repeat,
            processingLightSource: 'blue',
            pulseWidth: 200,
            mopaFrequency: 65,
            enableKerf: false,
            kerfDistance: 0,
          },
        },
      },
    },
  };
}

/**
 * The full xTool Studio project: one canvas holding the dieline, plus a processing map
 * that assigns cut paths and dashed perforations to VECTOR_CUTTING and score paths to VECTOR_ENGRAVING.
 */
export function buildXcsProject(
  model: GeneratedBoxModel,
  device: XcsDeviceTemplate,
  now: number = Date.now(),
  newId: XcsIdGenerator = randomId
): object {
  const { displays, layerOf, cutThrough } = buildXcsDisplays(model, newId);
  const laser = laserSettingsFor(model.params);
  const canvasId = newId();

  const layerData: Record<string, { name: string; order: number; visible: true }> = {};
  for (const d of displays) {
    if (!layerData[d.layerColor]) {
      layerData[d.layerColor] = { name: d.layerColor, order: Object.keys(layerData).length + 1, visible: true };
    }
  }

  const entries = displays.map((d) => [
    d.id,
    layerOf.get(d.id) === 'cut' || cutThrough.has(d.id)
      ? processingEntry('VECTOR_CUTTING', laser.cutPower, laser.cutSpeed, laser.cutPasses)
      : processingEntry('VECTOR_ENGRAVING', laser.scorePower, laser.scoreSpeed, 1),
  ]);

  return {
    canvasId,
    canvas: [
      {
        id: canvasId,
        title: '{panel}1',
        displays,
        hidden: false,
        layerData,
        groupData: {},
        extendInfo: {
          version: '2.15.108',
          minCanvasVersion: '0.0.0',
          displayProcessConfigMap: {},
          rulerPluginData: { rulerGuide: [] },
          type: '2d',
          gridOptions: { color: '#dadada', isShow: true },
        },
      },
    ],
    extId: device.extId,
    extName: device.extName,
    version: '1.7.24',
    minRequiredVersion: '1.0.0',
    appMinRequiredVersion: '',
    webMinRequiredVersion: '',
    created: now,
    modify: now,
    ua: 'kerfuffle/0.1',
    meta: [],
    projectTraceID: newId(),
    device: {
      id: device.deviceId,
      extId: device.extId,
      extName: device.extName,
      power: device.power,
      materialList: [],
      materialTypeList: [],
      customProjectData: {},
      ...device.extra,
      data: {
        dataType: 'Map',
        value: [
          [
            canvasId,
            {
              mode: 'LASER_PLANE',
              data: {
                LASER_PLANE: {
                  material: 0,
                  lightSourceMode: 'blue',
                  thickness: model.params.materialThicknessMm,
                  isProcessByLayer: true,
                  pathPlanning: 'auto',
                  fillPlanning: 'separate',
                },
              },
              displays: { dataType: 'Map', value: entries },
            },
          ],
        ],
      },
    },
  };
}

/** The dieline as an xTool Studio `.xcs` project (plain JSON). */
export function exportXcsProject(model: GeneratedBoxModel): string {
  return JSON.stringify(buildXcsProject(model, XCS_DEVICE_M2));
}
