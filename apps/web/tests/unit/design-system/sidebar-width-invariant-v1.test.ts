import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(appRoot, relativePath), 'utf8');
}

const TOKEN_DECLARATION = /--app-shell-sidebar-width:\s*(\d+(?:\.\d+)?)px/;

describe('JOV-8108 left-sidebar-width-invariant-v1', () => {
  it('locks --app-shell-sidebar-width at 224px', () => {
    const css = readSource('styles/design-system.css');
    const match = TOKEN_DECLARATION.exec(css);
    expect(match, '--app-shell-sidebar-width declaration').toBeTruthy();
    expect(Number(match?.[1])).toBe(224);
  });

  it('never exceeds the 260px hard ceiling', () => {
    const css = readSource('styles/design-system.css');
    for (const match of css.matchAll(
      /--app-shell-sidebar-width:\s*(\d+(?:\.\d+)?)px/g
    )) {
      expect(Number(match[1])).toBeLessThanOrEqual(260);
    }
  });

  it('keeps DemoShell on the shared token instead of a px override', () => {
    const source = readSource('components/features/demo/DemoShell.tsx');
    expect(source).not.toMatch(/--sidebar-width['"]?\s*:\s*['"`]\d+px/);
  });
});
