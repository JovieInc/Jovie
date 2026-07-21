import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

const rawComponentVisualPatterns = [
  /\b(?:text|rounded|shadow|border|bg|px|py|pt|pb|min-w|min-h|max-w|max-h|w|h|tracking|blur|duration|z)-\[[^\]]+\]/,
  /\bfont-\[[^\]]+\]/,
  /\brgba?\(/,
  /#[0-9A-Fa-f]{3,8}\b/,
  /(?:radial|linear)-gradient/,
  /\bdrop-shadow-/,
  /\bshadow-/,
  /\bblur-/,
  /--linear-/,
  /--surface-[0-9]/,
];

describe('/start loading System B style guard', () => {
  it('keeps the loading route on named System B primitives', () => {
    const source = readFileSync(
      path.join(webRoot, 'app/(dynamic)/start/loading.tsx'),
      'utf8'
    );
    const offenders = rawComponentVisualPatterns
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.toString());

    expect(offenders, `/start loading leaked ${offenders.join(', ')}`).toEqual(
      []
    );
    expect(source).toContain('AppShellFrame');
    expect(source).toContain("variant='shellChatV1'");
    expect(source).toContain('system-b-start-loading-page');
    expect(source).toContain('system-b-start-loading-composer');
    expect(source).not.toContain('JovieMarkElectric');
    expect(source).not.toContain('style={{');
  });

  it('keeps the loading CSS quiet and token-backed', () => {
    const source = readFileSync(
      path.join(webRoot, 'styles/design-system.css'),
      'utf8'
    );
    const loadingCss = source.match(
      /:where\(\.system-b-start-loading-page\)[\s\S]*?\/\* ============================================\s+SYSTEM B ONBOARDING V2 PRIMITIVES/
    )?.[0];

    expect(loadingCss).toBeDefined();
    expect(loadingCss).toContain('var(--system-b-app-content-surface)');
    expect(loadingCss).toContain('var(--system-b-text-primary)');
    expect(loadingCss).toContain('var(--system-b-app-frame-seam)');
    expect(loadingCss).toContain('var(--system-b-radius-pill)');
    expect(loadingCss).toContain('var(--radius-3xl)');
    expect(loadingCss).toContain('var(--system-b-chat-composer-max-width)');
    expect(loadingCss).toContain(
      'var(--system-b-chat-loading-composer-height)'
    );
    expect(loadingCss).toContain('height: var(--space-8)');
    expect(loadingCss).toContain('var(--space-10)');
    expect(loadingCss).not.toMatch(/--linear-/);
    expect(loadingCss).not.toMatch(/--surface-[0-9]/);
    expect(loadingCss).not.toMatch(/\brgba?\(/);
    expect(loadingCss).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(loadingCss).not.toMatch(/(?:radial|linear)-gradient/);
    expect(loadingCss).not.toMatch(/\b(?:box-)?shadow\b/);
    expect(loadingCss).not.toMatch(/\bblur\b/);
  });
});
