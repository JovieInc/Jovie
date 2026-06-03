import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'styles.css'
);
const styles = readFileSync(stylesPath, 'utf8');
const stylesWithoutComments = styles.replace(/\/\*[\s\S]*?\*\//g, '');
const rootBlockMatch = stylesWithoutComments.match(/:root\s*{[\s\S]*?\n}/);
const stylesOutsideRoot = stylesWithoutComments.replace(
  /:root\s*{[\s\S]*?\n}/,
  ''
);

describe('extension sidepanel System B styles', () => {
  it('declares a local System B bridge token block', () => {
    expect(rootBlockMatch?.[0]).toContain('--extension-system-b-bg-base');
    expect(rootBlockMatch?.[0]).toContain('--extension-system-b-bg-surface-1');
    expect(rootBlockMatch?.[0]).toContain('--extension-system-b-text-primary');
    expect(rootBlockMatch?.[0]).toContain('--extension-system-b-border-subtle');
    expect(rootBlockMatch?.[0]).toContain('--extension-system-b-radius-lg');
    expect(rootBlockMatch?.[0]).toContain('--extension-system-b-dock-min-height');
  });

  it('keeps raw color literals inside the token bridge only', () => {
    expect(stylesOutsideRoot).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(stylesOutsideRoot).not.toMatch(/\brgba?\(/);
  });

  it('does not use decorative gradients or uppercase label styling', () => {
    expect(stylesOutsideRoot).not.toMatch(/\b(?:linear|radial)-gradient\(/);
    expect(stylesOutsideRoot).not.toMatch(/text-transform:\s*uppercase/);
    expect(stylesOutsideRoot).not.toMatch(/letter-spacing:(?!\s*0\b)/);
  });

  it('uses tokens for radius and shadow recipes outside the token bridge', () => {
    expect(stylesOutsideRoot).not.toMatch(/border-radius:(?!\s*var\()/);
    expect(stylesOutsideRoot).not.toMatch(/box-shadow:(?!\s*var\()/);
  });

  it('reserves stable shell space for action and prompt docks', () => {
    expect(styles).toContain('--extension-system-b-dock-min-height');
    expect(styles).toContain(
      'min-height: var(--extension-system-b-dock-min-height)'
    );
    expect(styles).toContain('.prompt-dock-stacked');
    expect(stylesOutsideRoot).not.toMatch(/position:\s*fixed/);
  });
});
