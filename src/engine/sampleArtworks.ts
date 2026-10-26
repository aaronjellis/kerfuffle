export interface SampleArtworkPreset {
  id: string;
  name: string;
  svgText: string;
  defaultWidthMm: number;
  defaultHeightMm: number;
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

export const SAMPLE_ARTWORK_PRESETS: SampleArtworkPreset[] = [
  {
    id: 'stamp-maker',
    name: 'Maker Crest Badge',
    defaultWidthMm: 45,
    defaultHeightMm: 45,
    svgText: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="54" fill="none" stroke="#1e293b" stroke-width="4"/>
      <circle cx="60" cy="60" r="46" fill="none" stroke="#d97706" stroke-width="2" stroke-dasharray="5 3"/>
      <polygon points="60,22 70,46 96,46 75,61 83,86 60,71 37,86 45,61 24,46 50,46" fill="#f59e0b" stroke="#1e293b" stroke-width="2.5"/>
      <rect x="24" y="52" width="72" height="18" rx="3" fill="#1e293b"/>
      <text x="60" y="65" font-family="monospace, sans-serif" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">CUSTOM BUILT</text>
    </svg>`,
  },
  {
    id: 'stamp-fragile',
    name: 'Fragile / This Side Up Stamp',
    defaultWidthMm: 56,
    defaultHeightMm: 34,
    svgText: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 96">
      <rect x="4" y="4" width="152" height="88" rx="6" fill="none" stroke="#dc2626" stroke-width="5"/>
      <rect x="12" y="12" width="136" height="72" rx="3" fill="none" stroke="#dc2626" stroke-width="1.5"/>
      <path d="M36 42 L36 22 M36 22 L28 30 M36 22 L44 30" stroke="#dc2626" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <path d="M124 42 L124 22 M124 22 L116 30 M124 22 L132 30" stroke="#dc2626" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <text x="80" y="46" font-family="sans-serif" font-size="22" font-weight="900" fill="#dc2626" text-anchor="middle" letter-spacing="2">FRAGILE</text>
      <text x="80" y="68" font-family="monospace, sans-serif" font-size="11" font-weight="700" fill="#1e293b" text-anchor="middle">HANDLE WITH CARE</text>
    </svg>`,
  },
  {
    id: 'stamp-compass',
    name: 'Treasure Compass Rose',
    defaultWidthMm: 50,
    defaultHeightMm: 50,
    svgText: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="52" fill="none" stroke="#0f172a" stroke-width="3"/>
      <circle cx="60" cy="60" r="38" fill="none" stroke="#0f172a" stroke-width="1.5"/>
      <polygon points="60,8 68,52 60,44 52,52" fill="#0f172a"/>
      <polygon points="60,112 68,68 60,76 52,68" fill="#64748b"/>
      <polygon points="112,60 68,68 76,60 68,52" fill="#0f172a"/>
      <polygon points="8,60 52,68 44,60 52,52" fill="#64748b"/>
      <circle cx="60" cy="60" r="6" fill="#f59e0b" stroke="#0f172a" stroke-width="2"/>
    </svg>`,
  },
];

export function createSampleArtworkDataUrl(preset: SampleArtworkPreset): string {
  return svgToDataUrl(preset.svgText);
}
