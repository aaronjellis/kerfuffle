import { Point2D } from './types';

export function buildRoundedRectPoints(
  w: number,
  h: number,
  r: number,
  segmentsPerCorner = 8
): Point2D[] {
  const radius = Math.max(0, Math.min(r, w / 2 - 0.1, h / 2 - 0.1));
  if (radius < 0.05) {
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
  }

  const pts: Point2D[] = [];
  const corners = [
    { cx: w - radius, cy: h - radius, startAngle: 0 },
    { cx: radius, cy: h - radius, startAngle: Math.PI / 2 },
    { cx: radius, cy: radius, startAngle: Math.PI },
    { cx: w - radius, cy: radius, startAngle: (3 * Math.PI) / 2 },
  ];

  for (const c of corners) {
    for (let i = 0; i <= segmentsPerCorner; i++) {
      const theta = c.startAngle + (i / segmentsPerCorner) * (Math.PI / 2);
      pts.push({
        x: c.cx + Math.cos(theta) * radius,
        y: c.cy + Math.sin(theta) * radius,
      });
    }
  }
  return pts;
}
