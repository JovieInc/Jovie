import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const componentPath = path.resolve(__dirname, 'PillSearch.tsx');
const designSystemPath = path.resolve(
  __dirname,
  '../../styles/design-system.css'
);

const componentVisualDriftPatterns = [
  /\b(?:text|rounded|shadow|border|bg|px|py|min-w|min-h|max-w|max-h|w|h|tracking|duration|z|top|left|right)-\[[^\]]+\]/,
  /\bfont-\[[^\]]+\]/,
  /tracking-\[-/,
  /shadow-\[/,
  /\b(?:bg|border|text|ring)-cyan-\d{2,3}/,
  /--linear-/,
];

const requiredPrimitiveClasses = [
  'system-b-pill-search-input',
  'system-b-pill-search-close',
  'system-b-pill-search-listbox',
  'system-b-pill-search-option',
  'system-b-pill-search-option-label',
  'system-b-pill-search-chip',
  'system-b-pill-search-chip-field',
  'system-b-pill-search-chip-value',
  'system-b-pill-search-chip-remove',
];

describe('PillSearch System B style guard', () => {
  it('keeps shell filter chrome on named System B primitives', () => {
    const componentSource = readFileSync(componentPath, 'utf8');
    const cssSource = readFileSync(designSystemPath, 'utf8');
    const offenders = componentVisualDriftPatterns
      .filter(pattern => pattern.test(componentSource))
      .map(pattern => pattern.toString());

    expect(
      offenders,
      `PillSearch visual chrome should use system-b-pill-search-* primitives.\n${offenders.join('\n')}`
    ).toEqual([]);

    for (const className of requiredPrimitiveClasses) {
      expect(componentSource).toContain(className);
      expect(cssSource).toContain(
        `.system-b-pill-search-${className.split('system-b-pill-search-')[1]}`
      );
    }
  });
});
