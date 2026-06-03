import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'styles.css'
);
const tokensPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'system-b-tokens.css'
);
const sidepanelPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'sidepanel.ts'
);
const staticCopyPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../scripts/copy-static.mjs'
);
const sidepanelHtmlPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../public/sidepanel.html'
);
const styles = readFileSync(stylesPath, 'utf8');
const tokens = readFileSync(tokensPath, 'utf8');
const sidepanel = readFileSync(sidepanelPath, 'utf8');
const staticCopy = readFileSync(staticCopyPath, 'utf8');
const sidepanelHtml = readFileSync(sidepanelHtmlPath, 'utf8');
const stylesWithoutComments = styles.replace(/\/\*[\s\S]*?\*\//g, '');
const tokensWithoutComments = tokens.replace(/\/\*[\s\S]*?\*\//g, '');
const tokenRootBlockMatch = tokensWithoutComments.match(/:root\s*{[\s\S]*?\n}/);
const tokensOutsideRoot = tokensWithoutComments.replace(
  /:root\s*{[\s\S]*?\n}/,
  ''
);

describe('extension sidepanel System B styles', () => {
  it('declares a dedicated local System B bridge token source', () => {
    expect(tokenRootBlockMatch?.[0]).toContain('color-scheme: dark');
    expect(tokenRootBlockMatch?.[0]).toContain('--extension-system-b-bg-base');
    expect(tokenRootBlockMatch?.[0]).toContain(
      '--extension-system-b-bg-surface-1'
    );
    expect(tokenRootBlockMatch?.[0]).toContain(
      '--extension-system-b-text-primary'
    );
    expect(tokenRootBlockMatch?.[0]).toContain(
      '--extension-system-b-border-subtle'
    );
    expect(tokenRootBlockMatch?.[0]).toContain('--extension-system-b-radius-lg');
    expect(tokenRootBlockMatch?.[0]).toContain(
      '--extension-system-b-dock-min-height'
    );
    expect(tokenRootBlockMatch?.[0]).toContain(
      '--extension-system-b-text-primary: #f7f8f8'
    );
    expect(tokensOutsideRoot.trim()).toBe('');
    expect(stylesWithoutComments).not.toMatch(/:root\s*{/);
  });

  it('loads and packages token styles before component styles', () => {
    expect(sidepanelHtml).toContain(
      '<link rel="stylesheet" href="./system-b-tokens.css" />'
    );
    expect(sidepanelHtml.indexOf('./system-b-tokens.css')).toBeLessThan(
      sidepanelHtml.indexOf('./styles.css')
    );
    expect(staticCopy).toContain(
      "['src/system-b-tokens.css', 'system-b-tokens.css']"
    );
  });

  it('keeps raw color literals inside the token source only', () => {
    expect(stylesWithoutComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(stylesWithoutComments).not.toMatch(/\brgba?\(/);
  });

  it('does not use decorative gradients or uppercase label styling', () => {
    expect(stylesWithoutComments).not.toMatch(/\b(?:linear|radial)-gradient\(/);
    expect(stylesWithoutComments).not.toMatch(/text-transform:\s*uppercase/);
    expect(stylesWithoutComments).not.toMatch(/letter-spacing:(?!\s*0\b)/);
    expect(stylesWithoutComments).not.toMatch(/[{;]\s*transform:/);
  });

  it('uses tokens for radius and shadow recipes in component styles', () => {
    expect(stylesWithoutComments).not.toMatch(/border-radius:(?!\s*var\()/);
    expect(stylesWithoutComments).not.toMatch(/box-shadow:(?!\s*var\()/);
  });

  it('reserves stable shell space for action and prompt docks', () => {
    expect(styles).toContain('--extension-system-b-dock-min-height');
    expect(styles).toContain(
      'min-height: var(--extension-system-b-dock-min-height)'
    );
    expect(styles).toContain('.prompt-dock-stacked');
    expect(stylesWithoutComments).not.toMatch(/position:\s*fixed/);
  });

  it('keeps the signed-out sidepanel to one System B sign-in action', () => {
    expect(sidepanel).toContain("title.textContent = 'Sign In To Continue'");
    expect(sidepanel).toContain("createButton('Sign In', 'primary'");
    expect(sidepanel).toContain("window.open('https://app.jov.ie/sign-in'");
    expect(sidepanel).toContain('showTopRail: false');
    expect(sidepanel).toContain('showPromptDock: false');
    expect(sidepanel).not.toContain('https://app.jov.ie/sign-up');
    expect(sidepanel).not.toContain("'Log In'");
    expect(sidepanel).not.toContain('Bring Jovie Into This Page');
  });
});
