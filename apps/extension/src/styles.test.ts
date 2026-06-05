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
const manifestPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../public/manifest.json'
);
const styles = readFileSync(stylesPath, 'utf8');
const tokens = readFileSync(tokensPath, 'utf8');
const sidepanel = readFileSync(sidepanelPath, 'utf8');
const staticCopy = readFileSync(staticCopyPath, 'utf8');
const sidepanelHtml = readFileSync(sidepanelHtmlPath, 'utf8');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  host_permissions?: string[];
};
const stylesWithoutComments = styles.replace(/\/\*[\s\S]*?\*\//g, '');
const tokensWithoutComments = tokens.replace(/\/\*[\s\S]*?\*\//g, '');
const tokenRootBlockMatch = tokensWithoutComments.match(/:root\s*{[\s\S]*?\n}/);
const tokensOutsideRoot = tokensWithoutComments.replace(
  /:root\s*{[\s\S]*?\n}/,
  ''
);

function getRule(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*{[^}]*}`));

  if (!match) {
    throw new Error(`Could not find ${selector}`);
  }

  return match[0];
}

function getRules(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(
    source.matchAll(new RegExp(`${escapedSelector}\\s*{[^}]*}`, 'g')),
    match => match[0]
  );
}

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
      '--extension-system-b-radius-pill'
    );
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

  it('keeps extension command buttons pill-shaped', () => {
    const buttonRule = stylesWithoutComments.match(
      /^\.button\s*{[\s\S]*?\n}/m
    );

    expect(buttonRule?.[0]).toContain(
      'border-radius: var(--extension-system-b-radius-pill)'
    );
    expect(buttonRule?.[0]).not.toContain(
      'border-radius: var(--extension-system-b-radius-sm)'
    );
  });

  it('reserves stable shell space for action and prompt docks', () => {
    const actionTrayRule = getRules(
      stylesWithoutComments,
      '.action-tray'
    ).find(rule => rule.includes('display: grid;'));
    const oneActionRule = getRule(
      stylesWithoutComments,
      '.action-tray[data-action-count="1"]'
    );
    const twoActionRule = getRule(
      stylesWithoutComments,
      '.action-tray[data-action-count="2"]'
    );
    const threeActionRule = getRule(
      stylesWithoutComments,
      '.action-tray[data-action-count="3"]'
    );
    const actionTrayButtonRule = getRule(
      stylesWithoutComments,
      '.action-tray .button'
    );

    expect(styles).toContain('--extension-system-b-dock-min-height');
    expect(styles).toContain(
      'min-height: var(--extension-system-b-dock-min-height)'
    );
    expect(styles).toContain('.prompt-dock-stacked');
    expect(sidepanel).toContain("shell.dataset.hasActionDock = 'true';");
    expect(sidepanel).toContain(
      'actionTray.dataset.actionCount = String(actionTray.childElementCount);'
    );
    expect(actionTrayRule).toContain('display: grid;');
    expect(actionTrayRule).toContain(
      'grid-auto-rows: var(--extension-system-b-action-height);'
    );
    expect(actionTrayRule).toContain('overflow-x: hidden;');
    expect(oneActionRule).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(twoActionRule).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr));'
    );
    expect(threeActionRule).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr));'
    );
    expect(actionTrayButtonRule).toContain('min-width: 0;');
    expect(actionTrayButtonRule).toContain('white-space: nowrap;');
    expect(stylesWithoutComments).not.toMatch(/position:\s*fixed/);
  });

  it('keeps signed-in entity action labels quiet', () => {
    const actionRule = getRule(stylesWithoutComments, '.entity-card-action');
    const activeActionRule = getRule(
      stylesWithoutComments,
      '.entity-card-active .entity-card-action'
    );

    expect(actionRule).toContain(
      'color: var(--extension-system-b-text-tertiary);'
    );
    expect(actionRule).not.toMatch(/background:/);
    expect(actionRule).not.toMatch(/--extension-system-b-focus/);
    expect(activeActionRule).toContain(
      'color: var(--extension-system-b-text-secondary);'
    );
  });

  it('keeps the signed-out sidepanel to one System B sign-in action', () => {
    expect(sidepanel).toContain("title.textContent = 'Sign In To Continue'");
    expect(sidepanel).toContain("createButton('Sign In', 'primary'");
    expect(sidepanel).toContain("new URL('/sign-in', apiBaseUrl)");
    expect(sidepanel).toContain('resolveApiBaseUrl(state.currentTabUrl)');
    expect(sidepanel).toContain('showTopRail: false');
    expect(sidepanel).toContain('showPromptDock: false');
    expect(sidepanel).not.toContain('https://app.jov.ie');
    expect(sidepanel).not.toContain('https://app.jov.ie/sign-up');
    expect(sidepanel).not.toContain("'Log In'");
    expect(sidepanel).not.toContain('Bring Jovie Into This Page');
  });

  it('permits the live Jovie auth origins used by extension sign-in', () => {
    expect(manifest.host_permissions).toEqual(
      expect.arrayContaining([
        'http://localhost/*',
        'http://127.0.0.1/*',
        'https://jov.ie/*',
        'https://staging.jov.ie/*',
      ])
    );
    expect(manifest.host_permissions).not.toContain('https://app.jov.ie/*');
    expect(sidepanel).toContain("const DEFAULT_API_BASE_URL = 'https://jov.ie'");
  });
});
