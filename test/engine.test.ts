import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import { computeOddFingerCount } from '../src/engine/fingerJointEngine';
import { generateBoxModel } from '../src/engine/boxGenerator';
import {
  export3DPrintBoxStl,
  exportBoxDxf,
  exportBoxPdf,
  exportBoxSvg,
  svgPathToSegments,
} from '../src/engine/exporters';
import { BoxTemplateId, FaceArtwork, Panel3DTransform } from '../src/engine/types';
import {
  computePieceAlignmentOffset,
  DEFAULT_TEXT_ARTWORK_CONFIG,
  GOOGLE_FONT_CATALOG,
  renderTextArtworkToDataUrl,
  resolvePieceDimensions,
} from '../src/engine/googleFonts';

describe('Boxer Parametric Geometry & Export Engine', () => {
  it('computes symmetric odd finger counts (>= 3)', () => {
    expect(computeOddFingerCount(100, 10)).toBe(11);
    expect(computeOddFingerCount(90, 10)).toBe(9);
    expect(computeOddFingerCount(20, 15)).toBe(3);
  });

  it('guarantees all wood finger-joint panel edges are strictly 90-degree orthogonal (no diagonal slashes)', () => {
    const woodTemplates: BoxTemplateId[] = [
      'finger-basic',
      'finger-clamshell',
      'finger-living-hinge',
      'finger-organizer',
    ];

    for (const templateId of woodTemplates) {
      const model = generateBoxModel({
        ...DEFAULT_BOX_PARAMETERS,
        category: 'wood-finger',
        templateId,
        clamshellHingeType: 'knuckle-pin',
      });

      for (const panel of model.panels2D) {
        const outlinePath = panel.paths.find((p) => p.id.endsWith('-outline'));
        if (!outlinePath || outlinePath.id.endsWith('-curved-outline')) continue;
        const segments = svgPathToSegments(outlinePath.d, 0, 0);
        expect(segments.length).toBeGreaterThanOrEqual(4);
        for (const seg of segments) {
          const dx = Math.abs(seg.x2 - seg.x1);
          const dy = Math.abs(seg.y2 - seg.y1);
          // Every segment on a rectangular finger-joint panel must be horizontal (dy ~ 0) or vertical (dx ~ 0)
          expect(Math.min(dx, dy)).toBeLessThan(1e-3);
        }
      }
    }
  });

  it('derives accurate outer dimensions from inner dimensions and material thickness', () => {
    const model = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      dimensionReference: 'inner',
      widthMm: 120,
      depthMm: 80,
      heightMm: 50,
      materialThicknessMm: 3,
      woodLidStyle: 'closed',
    });

    expect(model.innerDims).toEqual({ widthMm: 120, depthMm: 80, heightMm: 50 });
    expect(model.outerDims).toEqual({ widthMm: 126, depthMm: 86, heightMm: 56 });
    expect(model.panels2D.length).toBe(6);
  });

  it('reports the 3D print box outside height as inner height plus two floors', () => {
    const model = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: '3d-print',
      templateId: '3d-snap-box',
      dimensionReference: 'inner',
    });
    expect(model.outerDims.heightMm).toBeCloseTo(
      model.innerDims.heightMm + 2 * DEFAULT_BOX_PARAMETERS.floorThickness3dMm
    );
    const body = model.panels3D.reduce((sum, panel) => sum + panel.thicknessMm, 0);
    expect(body).toBeCloseTo(model.outerDims.heightMm);
  });

  it('gives the finger organizer no top ply whatever the lid style', () => {
    const T = 3;
    const organizer = {
      ...DEFAULT_BOX_PARAMETERS,
      category: 'wood-finger' as const,
      templateId: 'finger-organizer' as const,
      materialThicknessMm: T,
      woodLidStyle: 'flat-lid' as const,
    };
    const inner = generateBoxModel({ ...organizer, dimensionReference: 'inner', heightMm: 50 });
    expect(inner.outerDims.heightMm).toBeCloseTo(50 + T);
    const outer = generateBoxModel({
      ...organizer,
      dimensionReference: 'outer',
      widthMm: 120,
      depthMm: 80,
      heightMm: 60,
    });
    expect(outer.innerDims.heightMm).toBeCloseTo(60 - T);
    expect(outer.outerDims.heightMm).toBeCloseTo(60);
  });

  it('generates valid 2D dielines and 3D transforms across all 8 box templates', () => {
    const templates: { id: BoxTemplateId; category: 'wood-finger' | 'cardboard-fold' | '3d-print' }[] = [
      { id: 'finger-basic', category: 'wood-finger' },
      { id: 'finger-clamshell', category: 'wood-finger' },
      { id: 'finger-living-hinge', category: 'wood-finger' },
      { id: 'finger-organizer', category: 'wood-finger' },
      { id: 'cardboard-mailer', category: 'cardboard-fold' },
      { id: 'cardboard-tuck-carton', category: 'cardboard-fold' },
      { id: 'cardboard-telescope', category: 'cardboard-fold' },
      { id: '3d-snap-box', category: '3d-print' },
    ];

    for (const t of templates) {
      const model = generateBoxModel({
        ...DEFAULT_BOX_PARAMETERS,
        category: t.category,
        templateId: t.id,
      });
      expect(model.panels2D.length).toBeGreaterThan(0);
      expect(model.panels3D.length).toBeGreaterThan(0);
      expect(model.stats.totalCutLengthMm).toBeGreaterThan(100);
    }
  });

  it('supports dashed perforation score lines for corrugated cardboard', () => {
    const solidModel = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      templateId: 'cardboard-mailer',
      scoreLineMode: 'solid-score',
    });
    const perfModel = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      templateId: 'cardboard-mailer',
      scoreLineMode: 'dashed-perf',
      perfCutMm: 3,
      perfGapMm: 2,
    });

    const solidScorePath = solidModel.panels2D[0].paths.find((p) => p.layer === 'score');
    const perfScorePath = perfModel.panels2D[0].paths.find((p) => p.layer === 'score');
    expect(solidScorePath?.d).toBeDefined();
    expect(perfScorePath?.d.split('M').length).toBeGreaterThan(3);
  });

  it('unfolds all 3D cardboard panels onto the same flat floor plane with zero disconnected pieces', () => {
    const cardboardConfigs = [
      { templateId: 'cardboard-mailer' as const, tuckCartonStyle: 'reverse-tuck' as const },
      { templateId: 'cardboard-tuck-carton' as const, tuckCartonStyle: 'reverse-tuck' as const },
      { templateId: 'cardboard-tuck-carton' as const, tuckCartonStyle: 'straight-tuck' as const },
    ];

    for (const cfg of cardboardConfigs) {
      const model = generateBoxModel({
        ...DEFAULT_BOX_PARAMETERS,
        category: 'cardboard-fold',
        templateId: cfg.templateId,
        tuckCartonStyle: cfg.tuckCartonStyle,
        widthMm: 120,
        depthMm: 80,
        heightMm: 50,
      });

      const floorY = -model.innerDims.heightMm / 2;
      const panelMap = new Map(model.panels3D.map((p) => [p.id, p]));

      for (const panel of model.panels3D) {
        let [x, y, z] = panel.closedPos;
        let curr: Panel3DTransform | undefined = panel;
        while (curr?.foldRig) {
          const rig: NonNullable<Panel3DTransform['foldRig']> = curr.foldRig;
          const [px, py, pz] = rig.pivotOffset;
          const rx = x - px;
          const ry = y - py;
          const rz = z - pz;
          const cos = Math.cos(rig.flatAngleRad);
          const sin = Math.sin(rig.flatAngleRad);
          if (rig.axis === 'x') {
            y = py + (ry * cos - rz * sin);
            z = pz + (ry * sin + rz * cos);
          } else if (rig.axis === 'y') {
            x = px + (rx * cos + rz * sin);
            z = pz + (-rx * sin + rz * cos);
          } else if (rig.axis === 'z') {
            x = px + (rx * cos - ry * sin);
            y = py + (rx * sin + ry * cos);
          }
          curr = rig.parentId ? panelMap.get(rig.parentId) : undefined;
        }
        // Every panel must lie flat on the floor plane (y === floorY) when unfolded (progress = 0)
        expect(y).toBeCloseTo(floorY, 3);
      }
    }
  });

  it('exports 1:1 physical-scale SVG, Layered PDF, DXF, and STL with face artwork', async () => {
    const model = generateBoxModel({ ...DEFAULT_BOX_PARAMETERS, svgGroupingMode: 'by-layer' });
    const sampleArt: FaceArtwork[] = [
      {
        id: 'art-1',
        faceId: 'top',
        name: 'Test Badge',
        dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
        xMm: 0,
        yMm: 0,
        widthMm: 35,
        heightMm: 35,
        rotationDeg: 15,
        mode: 'print',
      },
    ];

    const svg = exportBoxSvg(model, sampleArt);
    expect(svg).toContain('width="');
    expect(svg).toContain('mm"');
    expect(svg).toContain('id="Print_Artwork"');
    expect(svg).toContain('id="Cut_Lines"');
    // Ensure each panel's cut lines are joined into a single <path id="<panel>-cut"> with baked coordinates
    expect(svg).toContain('<path id="bottom-cut" d="M ');
    expect(svg).not.toContain('transform="translate');

    const pdfBytes = await exportBoxPdf(model, sampleArt);
    expect(pdfBytes.byteLength).toBeGreaterThan(500);

    const dxf = exportBoxDxf(model);
    expect(dxf).toContain('$INSUNITS');
    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).not.toContain('\nLINE\n');
    expect(dxf).toContain('CUT');

    const stl = export3DPrintBoxStl({
      ...DEFAULT_BOX_PARAMETERS,
      category: '3d-print',
      templateId: '3d-snap-box',
    });
    expect(stl).toContain('solid Kerfuffle_3DPrint_Box');
    expect(stl).toContain('facet normal');
    expect(stl).toContain('endsolid Kerfuffle_3DPrint_Box');
  });

  it('toggles rear seam joinery on Clamshell boxes and reports exact physical panel cut dimensions', () => {
    const T = 3;
    const innerW = 110;
    const innerD = 80;
    const innerH = 55;
    const lidH = 18;
    const baseH = innerH - lidH; // 37mm

    const buttModel = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'wood-finger',
      templateId: 'finger-clamshell',
      widthMm: innerW,
      depthMm: innerD,
      heightMm: innerH,
      lidHeightMm: lidH,
      materialThicknessMm: T,
      clamshellHingeType: 'butt-hardware',
      includeHingeScrewHoles: true,
    });

    const baseBack = buttModel.panels2D.find((p) => p.id === 'base-back')!;
    const lidBack = buttModel.panels2D.find((p) => p.id === 'lid-back')!;
    // With flat butt seam on the hinge edge, physical height is baseH + T (40mm) and lidH + T (21mm), NOT + 2T
    expect(baseBack.widthMm).toBe(innerW + 2 * T);
    expect(baseBack.heightMm).toBe(baseH + T);
    expect(lidBack.widthMm).toBe(innerW + 2 * T);
    expect(lidBack.heightMm).toBe(lidH + T);
    // Pilot screw holes are generated on both base-back and lid-back
    expect(baseBack.paths.some((p) => p.id.includes('hinge-hole'))).toBe(true);
    expect(lidBack.paths.some((p) => p.id.includes('hinge-hole'))).toBe(true);
  });

  it('supports wall attachment modes on Living-Hinge boxes so the lid stays connected', () => {
    const onePieceModel = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'wood-finger',
      templateId: 'finger-living-hinge',
      livingHingeAttachMode: 'one-piece-back',
    });
    const fingerBackModel = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'wood-finger',
      templateId: 'finger-living-hinge',
      livingHingeAttachMode: 'finger-joint-back',
    });
    const sideTabsModel = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'wood-finger',
      templateId: 'finger-living-hinge',
      livingHingeAttachMode: 'side-arch-tabs',
    });

    // 1-piece mode merges the Back Spine Wall and Living-Hinge Wrap Lid into 5 panels in both 2D and 3D (bottom, front, left, right, 1-piece top+back)
    expect(onePieceModel.panels2D.length).toBe(5);
    expect(onePieceModel.panels3D.length).toBe(5);
    expect(onePieceModel.panels3D.some((p) => p.id === 'back')).toBe(false);
    // 2-piece finger-jointed back mode outputs 6 panels in both 2D and 3D with interlocking fingers between back and top
    expect(fingerBackModel.panels2D.length).toBe(6);
    expect(fingerBackModel.panels3D.length).toBe(6);
    // Side-arch-tabs mode adds top-deck retainer slots on the wrap lid
    const sideTop = sideTabsModel.panels2D.find((p) => p.id === 'top')!;
    expect(sideTop.paths.some((p) => p.id.includes('lh-top-side-slot'))).toBe(true);
    expect(sideTabsModel.panels3D.length).toBe(5);
  });

  it('accounts for material thickness on cardboard score lines, bend allowances, and double-score fold bridges', () => {
    const thinMailer = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      templateId: 'cardboard-mailer',
      widthMm: 120,
      depthMm: 80,
      heightMm: 50,
      materialThicknessMm: 1.5,
    });
    const thickMailer = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      templateId: 'cardboard-mailer',
      widthMm: 120,
      depthMm: 80,
      heightMm: 50,
      materialThicknessMm: 3.0,
    });

    // Blank width and height expand with material thickness T due to panel bend allowances and rollover/lock-tab bridges
    expect(thickMailer.panels2D[0].widthMm).toBeGreaterThan(thinMailer.panels2D[0].widthMm);
    expect(thickMailer.panels2D[0].heightMm).toBeGreaterThan(thinMailer.panels2D[0].heightMm);
  });

  it('produces distinct 3D panel assemblies across all 8 templates and updates 3D when template options change', () => {
    const mailer = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      templateId: 'cardboard-mailer',
    });
    const tuckRte = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      templateId: 'cardboard-tuck-carton',
      tuckCartonStyle: 'reverse-tuck',
    });
    const tuckSte = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      templateId: 'cardboard-tuck-carton',
      tuckCartonStyle: 'straight-tuck',
    });
    const telescope = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      templateId: 'cardboard-telescope',
      lidHeightMm: 28,
    });

    // Mailer, Tuck Carton, and Telescoping Box each have their own distinct 3D rig
    expect(tuckRte.panels3D.some((p) => p.id === 'glue-flap')).toBe(true);
    expect(mailer.panels3D.some((p) => p.id === 'glue-flap')).toBe(false);
    expect(telescope.panels3D.some((p) => p.id === 'lid-front')).toBe(true);

    // Switching RTE vs STE changes the 3D bottom closure hinge parent
    const botRte = tuckRte.panels3D.find((p) => p.id === 'bottom')!;
    const botSte = tuckSte.panels3D.find((p) => p.id === 'bottom')!;
    expect(botRte.foldRig?.parentId).toBe('front');
    expect(botSte.foldRig?.parentId).toBe('back');

    // Telescoping box includes 3D corner glue tabs on both Base Tray and Slip Lid
    expect(telescope.panels3D.some((p) => p.id === 'base-tab-fl')).toBe(true);
    expect(telescope.panels3D.some((p) => p.id === 'lid-tab-fr')).toBe(true);
    // Mailer box includes 3D dust flaps and double-score rollover bridges + inner walls
    expect(mailer.panels3D.some((p) => p.id === 'back-dust-l')).toBe(true);
    expect(mailer.panels3D.some((p) => p.id === 'left-roll-bridge')).toBe(true);
    expect(mailer.panels3D.some((p) => p.id === 'left-roll-inner')).toBe(true);

    // Organizer box has open top in 3D so interior dividers are visible when closed
    const organizer = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'wood-finger',
      templateId: 'finger-organizer',
      dividerCols: 3,
      dividerRows: 2,
    });
    expect(organizer.panels3D.some((p) => p.id === 'top')).toBe(false);
    expect(organizer.panels3D.some((p) => p.id === 'divider-x-1')).toBe(true);
  });

  it('scores customizable side names onto inner faces across wood panels and cardboard sub-faces', () => {
    const labeledWood = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'wood-finger',
      templateId: 'finger-basic',
      scoreInnerFaceLabels: true,
      scoreFaceDimensions: true,
      customFaceLabels: {
        ...DEFAULT_BOX_PARAMETERS.customFaceLabels,
        front: 'NORTH WALL',
        back: '', // blanking a side omits its score label
      },
    });

    const frontPanel = labeledWood.panels2D.find((p) => p.id === 'front')!;
    const backPanel = labeledWood.panels2D.find((p) => p.id === 'back')!;
    expect(frontPanel.faceLabel).toBe('NORTH WALL');
    expect(frontPanel.paths.some((p) => p.id === 'front-label-score' && p.layer === 'score')).toBe(true);
    expect(backPanel.paths.some((p) => p.id === 'back-label-score')).toBe(false);

    const svg = exportBoxSvg(labeledWood, []);
    expect(svg).toContain('id="front-score"');

    const labeledMailer = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      templateId: 'cardboard-mailer',
      scoreInnerFaceLabels: true,
    });
    const sheetPaths = labeledMailer.panels2D[0].paths;
    expect(sheetPaths.some((p) => p.id.includes('label-score-front') && p.layer === 'score')).toBe(true);
    expect(sheetPaths.some((p) => p.id.includes('label-score-bottom') && p.layer === 'score')).toBe(true);
  });

  it('renders Google Font text artwork and aligns items accurately to piece edges and centers', () => {
    expect(GOOGLE_FONT_CATALOG.length).toBeGreaterThanOrEqual(20);

    const rendered = renderTextArtworkToDataUrl(
      { ...DEFAULT_TEXT_ARTWORK_CONFIG, text: 'ARTISAN TEA', fontFamily: 'Playfair Display' },
      'engrave'
    );
    expect(rendered.dataUrl.startsWith('data:image/')).toBe(true);
    expect(rendered.aspectRatio).toBeGreaterThan(0.5);

    const model = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      widthMm: 120,
      depthMm: 80,
      heightMm: 50,
    });
    const frontDims = resolvePieceDimensions(model, 'front');
    expect(frontDims).toEqual({ widthMm: 120, heightMm: 50 });

    // Top-left alignment with 4mm margin for a 40x20 item on a 120x50 piece:
    // maxOffsetX = 120/2 - 4 - 40/2 = 36 => xMm = -36
    // maxOffsetY = 50/2 - 4 - 20/2 = 11 => yMm = -11
    const aligned = computePieceAlignmentOffset({
      pieceWidthMm: frontDims.widthMm,
      pieceHeightMm: frontDims.heightMm,
      artWidthMm: 40,
      artHeightMm: 20,
      rotationDeg: 0,
      currentXMm: 0,
      currentYMm: 0,
      anchorX: -1,
      anchorY: -1,
      marginMm: 4,
    });
    expect(aligned).toEqual({ xMm: -36, yMm: -11 });
  });

  it('exports clean ungroupable SVGs with flat 2-object mode and split score/cut layers for xTool Studio', () => {
    const mailer = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      templateId: 'cardboard-mailer',
      svgGroupingMode: 'flat-2-objects',
    });

    const flatSvg = exportBoxSvg(mailer, []);
    // Flat mode emits exactly 1 Score path and 1 Cut path with zero nested <g> wrappers
    expect(flatSvg).toContain('<path id="Score_Lines"');
    expect(flatSvg).toContain('<path id="Cut_Lines"');
    expect(flatSvg).not.toContain('<g id="Score_Lines">');
    expect(flatSvg).not.toContain('<g id="Cut_Lines">');

    const scoreOnlySvg = exportBoxSvg(mailer, [], 'score-only');
    expect(scoreOnlySvg).toContain('id="Score_Lines"');
    expect(scoreOnlySvg).not.toContain('id="Cut_Lines"');

    const cutOnlySvg = exportBoxSvg(mailer, [], 'cut-only');
    expect(cutOnlySvg).toContain('id="Cut_Lines"');
    expect(cutOnlySvg).not.toContain('id="Score_Lines"');
  });
});
