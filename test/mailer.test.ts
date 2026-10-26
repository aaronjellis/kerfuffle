import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import { applySideOverflow, computeMailerSpans } from '../src/engine/mailerEngine';

const base = { ...DEFAULT_BOX_PARAMETERS, category: 'cardboard-fold' as const, templateId: 'cardboard-mailer' as const };

describe('mailer ply model', () => {
  for (const T of [1.5, 3]) {
    it(`spans follow the ply table at T=${T}`, () => {
      const s = computeMailerSpans({ ...base, materialThicknessMm: T, includeLidFlaps: true }, 110, 80, 55);
      expect(s.roll).toBeCloseTo(2 * T);
      expect(s.floorW).toBeCloseTo(110 + T + 4 * T + 2 * T);
      expect(s.floorD).toBeCloseTo(80 + 2 * T);
      expect(s.backH).toBeCloseTo(55 + T);
      expect(s.frontH).toBeCloseTo(55 + T);
      expect(s.outerSideH).toBeCloseTo(55 + T / 2);
      expect(s.innerSideH).toBeCloseTo(55 - T / 2);
      expect(s.lidD).toBeCloseTo(80 + 3 * T);
      expect(s.tuckW).toBeCloseTo(110 - 2 * T);
      expect(s.lidFlapDepth).toBeCloseTo(55 - T);
      expect(s.earH).toBeCloseTo(55 - 2 * T);
      expect(s.slot.centerFromCrease).toBeCloseTo(2 * T);
      expect(s.slot.inset).toBeCloseTo(2 * T - (T + 0.5) / 2);
      expect(s.slot.width).toBeCloseTo(T + 0.5);
      expect(s.tab.depth).toBeCloseTo(T + 5);
    });
  }
  it('roll stays 2T with lid flaps off and the floor narrows by 2T', () => {
    const s = computeMailerSpans({ ...base, includeLidFlaps: false }, 110, 80, 55);
    expect(s.roll).toBeCloseTo(2 * s.T);
    expect(s.floorW).toBeCloseTo(110 + s.T + 4 * s.T);
    expect(s.lidFlapDepth).toBe(0);
  });
  it('front lock has tabs and slits; tuck top has a notch instead', () => {
    const lock = computeMailerSpans({ ...base, cardboardLockStyle: 'front-lock' }, 110, 80, 55);
    expect(lock.lock).toEqual({ tabW: 9, tabLen: 30, slitLen: 31 }); // tabW = roll 6 + T 3
    expect(lock.notchR).toBe(0);
    const tuck = computeMailerSpans({ ...base, cardboardLockStyle: 'tuck', thumbNotch: true }, 110, 80, 55);
    expect(tuck.lock).toBeNull();
    expect(tuck.notchR).toBeCloseTo(Math.min(12, 110 / 8));
  });
  it('keeps a shallow box printable: tab shallower than the inner wall', () => {
    const s = computeMailerSpans({ ...base, materialThicknessMm: 3 }, 60, 60, 15);
    expect(s.innerSideH).toBeCloseTo(13.5);
    expect(s.tab.depth).toBeCloseTo(8); // T + 5, under innerSideH - 2 = 11.5
  });
  it('floors the inner wall at 8 and clamps the tab to fit it', () => {
    const s = computeMailerSpans({ ...base, materialThicknessMm: 3 }, 60, 60, 8);
    expect(s.innerSideH).toBeCloseTo(8); // H - T/2 would be 6.5
    expect(s.tab.depth).toBeCloseTo(6); // innerSideH - 2
  });
  it('lays out the default box', () => {
    const s = computeMailerSpans({ ...base, materialThicknessMm: 3, includeLidFlaps: true }, 110, 80, 55);
    expect(s.x.tabL).toBe(0);
    expect(s.x.innerL).toBeCloseTo(8);
    expect(s.x.rollL).toBeCloseTo(61.5);
    expect(s.x.outerL).toBeCloseTo(67.5);
    expect(s.x.floorL).toBeCloseTo(124);
    expect(s.x.floorR).toBeCloseTo(255);
    expect(s.x.outerR).toBeCloseTo(311.5);
    expect(s.x.rollR).toBeCloseTo(317.5);
    expect(s.x.innerR).toBeCloseTo(371);
    expect(s.x.tabR).toBeCloseTo(379);
    expect(s.blankW).toBeCloseTo(379);
    expect(s.tuckH).toBeCloseTo(30);
    expect(s.y.tuckTop).toBe(0);
    expect(s.y.lidTop).toBeCloseTo(30);
    expect(s.y.backTop).toBeCloseTo(30 + 89);
    expect(s.y.floorTop).toBeCloseTo(30 + 89 + 58);
    expect(s.y.frontTop).toBeCloseTo(30 + 89 + 58 + 86);
    expect(s.y.frontBottom).toBeCloseTo(30 + 89 + 58 + 86 + 58);
    expect(s.blankH).toBeCloseTo(30 + 89 + 58 + 86 + 58);
    expect(s.tuckR).toBeCloseTo(8);
    expect(s.earW).toBeCloseTo(37);
    expect(s.earH).toBeCloseTo(49);
    expect(s.lidFlapLen).toBeCloseTo(77); // D - T
    expect(s.tab.len).toBeCloseTo(20);
    expect(s.tab.centers).toEqual([0.25, 0.75]);
  });
  it('turns the thumb notch off when asked', () => {
    const s = computeMailerSpans({ ...base, cardboardLockStyle: 'tuck', thumbNotch: false }, 110, 80, 55);
    expect(s.notchR).toBe(0);
  });
  it('caps the lock tab at the room that fits on a thin board', () => {
    // T = 1.5: roll 3, room = roll + T = 4.5, which is under the 8 mm floor.
    const s = computeMailerSpans({ ...base, materialThicknessMm: 1.5, cardboardLockStyle: 'front-lock' }, 110, 80, 55);
    expect(s.lock?.tabW).toBeCloseTo(4.5);
  });
});

describe('applySideOverflow', () => {
  const x = { tabL: 0, innerL: 5, rollL: 8, outerL: 10, floorL: 12, floorR: 50, outerR: 52, rollR: 54, innerR: 57, tabR: 62 };
  it('leaves the layout alone when nothing overhangs', () => {
    const r = applySideOverflow(x, 12);
    expect(r.x).toEqual(x);
    expect(r.blankW).toBe(62);
  });
  it('shifts every x right by the left overflow and widens blankW by both sides', () => {
    // reach 30: left overflow 18, right overflow = 50 + 30 - 62 = 18
    const r = applySideOverflow(x, 30);
    for (const k of Object.keys(x) as (keyof typeof x)[]) expect(r.x[k]).toBeCloseTo(x[k] + 18);
    expect(Math.min(...Object.values(r.x))).toBeGreaterThanOrEqual(0);
    expect(r.x.floorL - 30).toBeCloseTo(0);
    expect(r.blankW).toBeCloseTo(62 + 18 + 18);
    expect(r.x.floorR + 30).toBeCloseTo(r.blankW);
  });
});

import { generateBoxModel } from '../src/engine/boxGenerator';

describe('mailer 2D sheet', () => {
  const model = (over = {}) => generateBoxModel({ ...base, widthMm: 110, depthMm: 80, heightMm: 55, materialThicknessMm: 1.5, ...over });
  const paths = (m: ReturnType<typeof generateBoxModel>) => m.panels2D[0].paths;
  it('cuts two slots per side under the inner wall landing line', () => {
    const m = model();
    const s = computeMailerSpans(m.params, 110, 80, 55);
    const slots = paths(m).filter((p) => p.id.startsWith('mailer-slot-'));
    expect(slots).toHaveLength(4);
    const left1 = slots.find((p) => p.id === 'mailer-slot-l-1')!;
    const xs = left1.d.match(/-?\d+(\.\d+)?/g)!.filter((_, i) => i % 2 === 0).map(Number);
    expect(Math.min(...xs)).toBeCloseTo(s.x.floorL + s.slot.inset, 1);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(s.slot.width, 1);
  });
  it('front lock cuts a slit along each front ear crease and no notch', () => {
    const m = model({ cardboardLockStyle: 'front-lock' });
    const s = computeMailerSpans(m.params, 110, 80, 55);
    const slit = paths(m).find((p) => p.id === 'mailer-slit-l')!;
    expect(slit.layer).toBe('cut');
    const ys = slit.d.match(/-?\d+(\.\d+)?/g)!.filter((_, i) => i % 2 === 1).map(Number);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(s.lock!.slitLen - 1.5 * s.T, 1);
    expect(Math.max(...ys)).toBeCloseTo(s.y.frontBottom - 1.5 * s.T, 1);
    const earScore = paths(m).find((p) => p.id === 'score-ear-front-l')!;
    const eys = earScore.d.match(/-?\d+(\.\d+)?/g)!.filter((_, i) => i % 2 === 1).map(Number);
    expect(Math.max(...eys)).toBeLessThanOrEqual(s.y.frontBottom - s.lock!.slitLen + 0.01);
    expect(paths(m).find((p) => p.id === 'score-tuck')).toBeTruthy();
  });
  it('tuck top has no slits and the perimeter carries an arc for the notch', () => {
    const m = model({ cardboardLockStyle: 'tuck', thumbNotch: true });
    expect(paths(m).some((p) => p.id.startsWith('mailer-slit-'))).toBe(false);
    expect(paths(m).find((p) => p.id === 'mailer-perimeter-cut')!.d).toMatch(/A /);
  });
  it('lid flaps add two creases and widen the blank; off removes them', () => {
    const on = model({ includeLidFlaps: true });
    const off = model({ includeLidFlaps: false });
    expect(paths(on).some((p) => p.id === 'score-lid-flap-l')).toBe(true);
    expect(paths(off).some((p) => p.id === 'score-lid-flap-l')).toBe(false);
    expect(on.panels2D[0].widthMm).toBeGreaterThan(off.panels2D[0].widthMm);
  });
  it('narrow front-lock box keeps tabs inside the lid width', () => {
    const m = model({ widthMm: 30, cardboardLockStyle: 'front-lock' });
    const s = computeMailerSpans(m.params, 30, 80, 55);
    expect(s.tuckW + 2 * s.lock!.tabW).toBeLessThanOrEqual(s.floorW + 0.01);
  });
  it('short depth keeps the two floor tabs apart', () => {
    const s = computeMailerSpans({ ...base, depthMm: 40 }, 110, 40, 55);
    const gap = (0.75 - 0.25) * s.floorD - s.tab.len;
    expect(gap).toBeGreaterThanOrEqual(2);
  });
  it('low front-lock box clamps the slit so the front ear crease stays attached', () => {
    const m = model({ cardboardLockStyle: 'front-lock', heightMm: 15, materialThicknessMm: 3, scoreLineMode: 'solid-score' });
    const s = computeMailerSpans(m.params, 110, 80, 15);
    expect(s.lock!.slitLen).toBeLessThanOrEqual(s.frontH - 1.5 * s.T - 3 + 1e-9);
    const earScore = paths(m).find((p) => p.id === 'score-ear-front-l')!;
    const eys = earScore.d.match(/-?\d+(\.\d+)?/g)!.filter((_, i) => i % 2 === 1).map(Number);
    expect(Math.max(...eys) - Math.min(...eys)).toBeGreaterThanOrEqual(3 - 1e-6);
  });
  it('perforated mode survives a crease shorter than one perforation', () => {
    const m = model({ cardboardLockStyle: 'front-lock', scoreLineMode: 'dashed-perf', perfCutMm: 3, perfGapMm: 1.5, heightMm: 15 });
    expect(m.panels2D[0].paths.every((p) => typeof p.d === 'string')).toBe(true);
  });
});

/** Endpoints of M/L/Q/A commands, skipping control points and arc parameters. */
function parsePathVertices(d: string): { x: number; y: number }[] {
  const tokens = d.match(/[MLQAZ]|-?\d+(\.\d+)?/g) ?? [];
  const take: Record<string, number> = { M: 2, L: 2, Q: 4, A: 7 };
  const out: { x: number; y: number }[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'Z') continue;
    const n = take[cmd];
    const args = tokens.slice(i, i + n).map(Number);
    out.push({ x: args[n - 2], y: args[n - 1] });
    i += n;
  }
  return out;
}

describe('mailer perimeter geometry', () => {
  const m = generateBoxModel({
    ...base,
    widthMm: 110,
    depthMm: 80,
    heightMm: 55,
    materialThicknessMm: 1.5,
    cardboardLockStyle: 'front-lock',
    includeLidFlaps: true,
  });
  const s = computeMailerSpans(m.params, 110, 80, 55);
  const sheetPaths = m.panels2D[0].paths;
  const vs = parsePathVertices(sheetPaths.find((p) => p.id === 'mailer-perimeter-cut')!.d);
  const has = (x: number, y: number, tol = 0.01) => vs.some((v) => Math.abs(v.x - x) <= tol && Math.abs(v.y - y) <= tol);

  it('closes on its starting vertex', () => {
    const first = vs[0];
    const last = vs[vs.length - 1];
    expect(Math.abs(first.x - last.x)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(first.y - last.y)).toBeLessThanOrEqual(1e-6);
  });
  it('mirrors left to right', () => {
    for (const v of vs) expect(has(s.blankW - v.x, v.y)).toBe(true);
  });
  it('puts the lid flap lead-in chamfer at the front end', () => {
    const fx = s.x.floorR + s.lidFlapDepth;
    const fy0 = s.y.lidTop + s.T;
    expect(has(fx - 4, fy0)).toBe(true);
    expect(has(fx, fy0 + 4)).toBe(true);
    expect(has(fx - 4, fy0 + s.lidFlapLen)).toBe(false);
  });
  it('drops the lock tab root by tabW · tan 15°', () => {
    const tx0 = s.x.floorL + (s.floorW - s.tuckW) / 2;
    const drop = s.lock!.tabW * Math.tan((15 * Math.PI) / 180);
    expect(has(tx0 - s.lock!.tabW, s.y.lidTop - drop)).toBe(true);
    expect(has(tx0, s.y.lidTop)).toBe(true);
  });
  it('centres each inner-wall tab on its floor slot', () => {
    const tabYs = vs.filter((v) => Math.abs(v.x - s.x.tabR) < 0.01).map((v) => v.y).sort((a, b) => a - b);
    expect(tabYs).toHaveLength(4);
    const tabCenters = [(tabYs[0] + tabYs[1]) / 2, (tabYs[2] + tabYs[3]) / 2];
    [1, 2].forEach((n, i) => {
      const ys = parsePathVertices(sheetPaths.find((p) => p.id === `mailer-slot-r-${n}`)!.d).map((v) => v.y);
      expect(tabCenters[i]).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2, 6);
    });
  });
});

describe('mailer 3D rig', () => {
  const closed = (m: ReturnType<typeof generateBoxModel>, id: string) => m.panels3D.find((p) => p.id === id)!;
  it('folds to the typed inner size at T=1.5 and T=3', () => {
    for (const T of [1.5, 3]) {
      for (const includeLidFlaps of [false, true]) {
        const m = generateBoxModel({ ...base, widthMm: 110, depthMm: 80, heightMm: 55, materialThicknessMm: T, includeLidFlaps });
        const li = closed(m, 'left-roll-inner'), ri = closed(m, 'right-roll-inner');
        // With lid flaps the inner walls stand T further out; the flaps tuck inside them.
        expect(ri.closedPos[0] - li.closedPos[0] - T).toBeCloseTo(includeLidFlaps ? 110 + 2 * T : 110, 1);
        const back = closed(m, 'back'), tuck = closed(m, 'tuck-flap');
        expect(tuck.closedPos[2] - T / 2 - (back.closedPos[2] + T / 2)).toBeCloseTo(80, 1);
        const floor = closed(m, 'bottom'), top = closed(m, 'top');
        expect(top.closedPos[1] - T / 2 - (floor.closedPos[1] + T / 2)).toBeCloseTo(55, 1);
        if (includeLidFlaps) {
          for (const id of ['lid-flap-l', 'lid-flap-r']) {
            const f = closed(m, id);
            const pivotX = f.foldRig!.pivotOffset[0];
            const freeMidX = pivotX + 2 * (f.closedPos[0] - pivotX);
            // The free end's inner face: half a ply toward the centre.
            const innerFace = Math.abs(freeMidX) - T / 2;
            expect(Math.abs(innerFace - 55)).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
  it('centres every floor slot on the inner wall above it, flaps on and off', () => {
    for (const T of [1.5, 3]) {
      for (const includeLidFlaps of [false, true]) {
        const m = generateBoxModel({ ...base, widthMm: 110, depthMm: 80, heightMm: 55, materialThicknessMm: T, includeLidFlaps });
        const floor = closed(m, 'bottom');
        const innerX = [closed(m, 'left-roll-inner').closedPos[0], closed(m, 'right-roll-inner').closedPos[0]];
        for (const hole of floor.holeContours!) {
          const xs = hole.map((p) => p.x - floor.widthMm / 2);
          const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
          expect(Math.min(...innerX.map((x) => Math.abs(x - cx)))).toBeLessThan(0.01);
        }
      }
    }
  });
  it('cuts four slots through the floor and puts tabs on the inner walls', () => {
    const m = generateBoxModel({ ...base });
    expect(closed(m, 'bottom').holeContours).toHaveLength(4);
    const inner = closed(m, 'left-roll-inner');
    const maxY = Math.max(...inner.outlinePoints!.map((p) => p.y));
    expect(maxY).toBeGreaterThan(inner.heightMm + 1);
  });
  it('adds lid flaps and lock tabs as children, and drops them when off', () => {
    const on = generateBoxModel({ ...base, includeLidFlaps: true, cardboardLockStyle: 'front-lock' });
    expect(closed(on, 'lid-flap-l').foldRig?.parentId).toBe('top');
    expect(closed(on, 'lock-tab-l').foldRig?.parentId).toBe('tuck-flap');
    const off = generateBoxModel({ ...base, includeLidFlaps: false, cardboardLockStyle: 'tuck' });
    expect(off.panels3D.some((p) => p.id.startsWith('lid-flap-') || p.id.startsWith('lock-tab-'))).toBe(false);
  });
  it('every child names an existing parent and stages lie in 0..1', () => {
    const m = generateBoxModel({ ...base, cardboardLockStyle: 'front-lock' });
    const ids = new Set(m.panels3D.map((p) => p.id));
    for (const p of m.panels3D) {
      if (p.foldRig?.parentId) expect(ids.has(p.foldRig.parentId)).toBe(true);
      if (p.foldRig) expect(p.foldRig.stage[0]).toBeLessThan(p.foldRig.stage[1]);
    }
  });
});
