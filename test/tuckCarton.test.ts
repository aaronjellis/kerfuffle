import { describe, expect, it } from 'vitest';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxParameters } from '../src/engine/types';

const inner = { widthMm: 110, depthMm: 80, heightMm: 55 };

const carton = (style: BoxParameters['tuckCartonStyle'], T: number) =>
  generateBoxModel({
    ...DEFAULT_BOX_PARAMETERS,
    ...inner,
    category: 'cardboard-fold',
    templateId: 'cardboard-tuck-carton',
    tuckCartonStyle: style,
    materialThicknessMm: T,
    dimensionReference: 'inner',
  });

/** A straight score line's endpoints; dashed perforations are not used here. */
const line = (m: ReturnType<typeof carton>, id: string) => {
  const p = m.panels2D[0].paths.find((x) => x.id === id);
  if (!p) return null;
  const n = p.d.match(/-?[\d.]+/g)!.map(Number);
  return { x1: n[0], y1: n[1], x2: n[2], y2: n[3] };
};

for (const style of ['reverse-tuck', 'straight-tuck'] as const) {
  for (const T of [0.6, 1.5, 3]) {
    describe(`${style} at T=${T}`, () => {
      const m = carton(style, T);
      const { depthMm: D } = inner;

      it('creases each dust flap one ply inside the lid crease, so the lid folds over it', () => {
        const lidTop = line(m, 'score-top-lid')!;
        const lidBot = line(m, 'score-bot-lid')!;
        for (const id of ['score-top-dust-l', 'score-top-dust-r']) expect(line(m, id)!.y1 - lidTop.y1).toBeCloseTo(T, 6);
        for (const id of ['score-bot-dust-l', 'score-bot-dust-r']) expect(lidBot.y1 - line(m, id)!.y1).toBeCloseTo(T, 6);
      });

      it('cuts each lid D long between its creases, so the tuck goes inside the far wall', () => {
        expect(line(m, 'score-top-lid')!.y1 - line(m, 'score-top-tuck')!.y1).toBeCloseTo(D, 6);
        expect(line(m, 'score-bot-tuck')!.y1 - line(m, 'score-bot-lid')!.y1).toBeCloseTo(D, 6);
      });

      it('scores no panel edge that has no flap', () => {
        const ids = m.panels2D[0].paths.filter((p) => p.layer === 'score').map((p) => p.id);
        expect(ids).not.toContain('score-top-front');
        expect(ids).not.toContain('score-bot-front');
        expect(ids).not.toContain('score-bot-back');
      });

      it('closed in 3D, the dust flaps lie one ply under the lid and the tucks one ply inside their wall', () => {
        const at = (id: string) => m.panels3D.find((p) => p.id === id)!;
        for (const d of ['top-dust-l', 'top-dust-r']) expect(at('top').closedPos[1] - at(d).closedPos[1]).toBeCloseTo(T, 6);
        for (const d of ['bot-dust-l', 'bot-dust-r']) expect(at(d).closedPos[1] - at('bottom').closedPos[1]).toBeCloseTo(T, 6);
        // The top lid hangs off the back, so its tuck goes inside the front; the bottom tuck goes inside
        // the wall opposite the bottom lid's hinge.
        expect(at('front').closedPos[2] - at('top-tuck').closedPos[2]).toBeCloseTo(T, 6);
        const botTuckWall = style === 'reverse-tuck' ? 'back' : 'front';
        expect(Math.abs(at(botTuckWall).closedPos[2] - at('bot-tuck').closedPos[2])).toBeCloseTo(T, 6);
      });

      it('closed in 3D, the walls reach their creases and no further', () => {
        const at = (id: string) => m.panels3D.find((p) => p.id === id)!;
        const top = (id: string) => at(id).closedPos[1] + at(id).heightMm / 2;
        expect(top('front')).toBeCloseTo(at('top').closedPos[1], 6);
        expect(top('back')).toBeCloseTo(at('top').closedPos[1], 6);
        expect(top('left')).toBeCloseTo(at('top-dust-l').closedPos[1], 6);
        expect(top('right')).toBeCloseTo(at('top-dust-r').closedPos[1], 6);
      });
    });
  }
}

describe('straight tuck depth', () => {
  it('stops each tuck 1 mm short of the middle of the front wall when asked for a deeper one', () => {
    for (const T of [1.5, 3]) {
      const m = generateBoxModel({
        ...DEFAULT_BOX_PARAMETERS,
        ...inner,
        category: 'cardboard-fold',
        templateId: 'cardboard-tuck-carton',
        tuckCartonStyle: 'straight-tuck',
        tuckFlapMm: 45,
        materialThicknessMm: T,
      });
      const at = (id: string) => m.panels3D.find((p) => p.id === id)!;
      const topTip = at('top-tuck').closedPos[1] - at('top-tuck').heightMm / 2;
      const botTip = at('bot-tuck').closedPos[1] + at('bot-tuck').heightMm / 2;
      expect(topTip - botTip).toBeCloseTo(2, 6);
    }
  });
  it('leaves a reverse tuck at the depth asked for', () => {
    const m = carton('reverse-tuck', 3);
    expect(m.panels3D.find((p) => p.id === 'top-tuck')!.heightMm).toBe(DEFAULT_BOX_PARAMETERS.tuckFlapMm);
  });
});

describe('glue joint and dust clearance', () => {
  for (const style of ['reverse-tuck', 'straight-tuck'] as const) {
    for (const T of [0.6, 1.5, 3]) {
      const m = carton(style, T);
      const { depthMm: D } = inner;
      const at = (id: string) => m.panels3D.find((p) => p.id === id)!;

      it(`${style} T=${T}: the glue-side wall runs D between creases, so the glue flap lies inside the back`, () => {
        expect(line(m, 'score-l-f')!.x1 - line(m, 'score-glue')!.x1).toBeCloseTo(D, 6);
        // In 3D the glue crease sits on the glue flap's plane, one ply inside the back's mid-plane.
        const glue = at('glue-flap');
        expect(glue.foldRig!.pivotOffset[2]).toBeCloseTo(at('back').closedPos[2] + T, 6);
        expect(glue.closedPos[2]).toBeCloseTo(at('back').closedPos[2] + T, 6);
      });

      it(`${style} T=${T}: dust creases stop short of the wall creases by the tuck's room`, () => {
        const room = 1.5 * T + 0.5;
        const walls = [line(m, 'score-glue')!.x1, line(m, 'score-l-f')!.x1, line(m, 'score-f-r')!.x1, line(m, 'score-r-b')!.x1];
        for (const [id, a, b] of [
          ['score-top-dust-l', walls[0], walls[1]],
          ['score-top-dust-r', walls[2], walls[3]],
          ['score-bot-dust-l', walls[0], walls[1]],
          ['score-bot-dust-r', walls[2], walls[3]],
        ] as const) {
          const s = line(m, id)!;
          expect(Math.min(s.x1, s.x2) - a).toBeCloseTo(room, 6);
          expect(b - Math.max(s.x1, s.x2)).toBeCloseTo(room, 6);
        }
      });

      it(`${style} T=${T}: closed, every dust flap clears the tucks by half a millimetre`, () => {
        for (const d of ['top-dust-l', 'top-dust-r', 'bot-dust-l', 'bot-dust-r']) {
          const dust = at(d);
          const zMin = dust.closedPos[2] - dust.heightMm / 2;
          const zMax = dust.closedPos[2] + dust.heightMm / 2;
          const tuck = at(d.startsWith('top') ? 'top-tuck' : 'bot-tuck');
          const tz = tuck.closedPos[2];
          // The tuck's near face, toward the box's middle.
          const near = tz > 0 ? tz - T / 2 : tz + T / 2;
          const gap = tz > 0 ? near - zMax : zMin - near;
          // On the glue side the dust flap also clears the glue flap's ply, so it stands T further off.
          const glueSide = d.endsWith('-l') && tz < 0;
          expect(gap).toBeCloseTo(glueSide ? T + 0.5 : 0.5, 6);
        }
      });
    }
  }
});
