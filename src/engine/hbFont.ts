/**
 * A font file shaped by HarfBuzz, the shaping engine Chrome and Firefox use: kerning, ligatures and
 * contextual forms (the joins in script fonts) come out as the browser draws them.
 */
import * as hb from 'harfbuzzjs';
import type { OutlineCommand, TextFont } from './textOutline';

/** A TTF or OTF file as a `TextFont`. Throws if HarfBuzz can't read it. */
export function harfbuzzFont(bytes: ArrayBuffer): TextFont {
  const face = new hb.Face(new hb.Blob(bytes));
  const upem = face.upem;
  if (!upem) throw new Error('Not a font HarfBuzz can read');
  const font = new hb.Font(face);
  const outlines = new Map<number, OutlineCommand[]>();
  // Glyph outlines in font units, y up; drawn once each.
  const glyphOutline = (gid: number) => {
    let cmds = outlines.get(gid);
    if (!cmds) {
      cmds = font.glyphToJson(gid).map((c) => ({ type: c.type as OutlineCommand['type'], values: c.values }));
      outlines.set(gid, cmds);
    }
    return cmds;
  };

  return {
    hasChar: (ch) => (font.nominalGlyph(ch.codePointAt(0)!) ?? 0) > 0,
    shape(text, sizePx) {
      const buffer = new hb.Buffer();
      buffer.addText(text);
      buffer.guessSegmentProperties();
      hb.shape(font, buffer);
      const infos = buffer.getGlyphInfos();
      const positions = buffer.getGlyphPositions();
      const s = sizePx / upem;
      const commands: OutlineCommand[] = [];
      let pen = 0;
      infos.forEach((info, i) => {
        const p = positions[i];
        const ox = pen + p.xOffset;
        const oy = p.yOffset;
        for (const c of glyphOutline(info.codepoint)) {
          commands.push({
            type: c.type,
            values: c.values.map((v, k) => (k % 2 === 0 ? (ox + v) * s : -(oy + v) * s)),
          });
        }
        pen += p.xAdvance;
      });
      return { advance: pen * s, commands };
    },
    emTopToBaseline(sizePx) {
      const { ascender, descender } = font.hExtents();
      return (sizePx * ascender) / (ascender - descender);
    },
  };
}
