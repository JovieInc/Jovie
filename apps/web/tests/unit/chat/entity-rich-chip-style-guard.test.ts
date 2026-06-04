import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

const guardedFiles = [
  'components/jovie/components/ChatGenerationArtifactSurface.tsx',
  'components/jovie/components/ChatPitchCard.tsx',
  'components/jovie/components/EntityChip.tsx',
  'components/jovie/components/EntityChipPopover.tsx',
  'components/jovie/components/EntityPreviewPane.tsx',
  'components/shell/DspAvatarStack.tsx',
  'components/shell/EntityPopover.tsx',
];

const rawVisualPatterns = [
  /\b(?:text|rounded|shadow|border|bg|px|py|min-w|min-h|max-w|max-h|w|h|tracking|duration|z)-\[[^\]]+\]/,
  /\bfont-\[[^\]]+\]/,
  /tracking-\[-/,
  /color-mix\s*\(\s*in\s+srgb/i,
  /\brgba?\(/,
  /#[0-9A-Fa-f]{3,8}\b/,
  /\btext-red-\d{2,3}\b/,
];

describe('entity rich chip System B style guard', () => {
  it('keeps touched chip, preview, DSP, and artifact visuals on named primitives', () => {
    for (const file of guardedFiles) {
      const source = readFileSync(path.join(webRoot, file), 'utf8');
      const offenders = rawVisualPatterns
        .filter(pattern => pattern.test(source))
        .map(pattern => pattern.toString());

      expect(offenders, `${file} leaked ${offenders.join(', ')}`).toEqual([]);
    }
  });
});
