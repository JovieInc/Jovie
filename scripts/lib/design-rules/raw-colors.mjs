/**
 * The raw colour rule behind the certificate's `tokens` criterion: Tailwind
 * palette classes, raw white or black, hex, colour functions and arbitrary
 * colours. Components use semantic tokens instead (design-system.css).
 * @type {[RegExp, string][]}
 */
export const RAW_COLOR_PATTERNS = [
  [
    /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|shadow|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
    'tailwind-palette',
  ],
  [
    /\b(?:bg|text|border|ring|fill|stroke)-(?:white|black)(?:\/\d+)?\b/g,
    'raw-white-black',
  ],
  [/#[0-9a-fA-F]{3,8}\b/g, 'hex'],
  [/\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(\s*[\d.]/g, 'color-function'],
  [/\[(?:#|rgb|hsl|oklch)[^\]]*\]/g, 'arbitrary-color'],
];
