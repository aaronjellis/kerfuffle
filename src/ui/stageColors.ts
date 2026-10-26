/**
 * Stage colors for code that can't read CSS custom properties (the three.js scene, SVG
 * attributes in the 2D view). Each mirrors a token in tokens.css; keep them in step.
 */

/** The stage background and the 3D scene's clear color. Mirrors `--stage`. */
export const STAGE_HEX = '#2b3036';

/**
 * The selection color on the stage: the 3D glow and outline, the 2D highlight. The stage is
 * dark in both themes, so this is the dark-scheme accent. Mirrors `--stage-accent`.
 */
export const STAGE_ACCENT_HEX = '#9fcf52';
