import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

const guardedRoutes = [
  'app/app/(shell)/chat/loading.tsx',
  'app/app/(shell)/dashboard/profile/loading.tsx',
];

const localChromePatterns = [
  /rounded-\[[^\]]+\]/,
  /bg-\[[^\]]+\]/,
  /shadow-\[[^\]]+\]/,
  /\bborder-black\//,
  /\bdark:border-white\//,
  /--linear-/,
];

describe('chat and profile loading System B style guard', () => {
  it('keeps shell loading composer chrome on named System B primitives', () => {
    for (const route of guardedRoutes) {
      const source = readFileSync(path.join(webRoot, route), 'utf8');
      const offenders = localChromePatterns
        .filter(pattern => pattern.test(source))
        .map(pattern => pattern.toString());

      expect(offenders, `${route} leaked ${offenders.join(', ')}`).toEqual([]);
      expect(source).toContain('system-b-shell-loading-composer');
      expect(source).toContain('border-subtle');
      expect(source).not.toContain('border-(--linear-app-frame-seam)');
    }
  });

  it('defines the shell loading composer from System B aliases', () => {
    const source = readFileSync(
      path.join(webRoot, 'styles/design-system.css'),
      'utf8'
    );
    const composerCss = source.match(
      /:where\(\.system-b-shell-loading-composer\)[\s\S]*?\/\* ============================================\s+SYSTEM B ONBOARDING V2 PRIMITIVES/
    )?.[0];

    expect(composerCss).toBeDefined();
    expect(composerCss).toContain('var(--system-b-app-frame-seam)');
    expect(composerCss).toContain('var(--system-b-radius-pill)');
    expect(composerCss).toContain('var(--system-b-app-content-surface)');
    expect(composerCss).toContain('var(--system-b-bg-surface-0)');
    expect(composerCss).not.toMatch(/--linear-/);
    expect(composerCss).not.toMatch(/\brgba?\(/);
    expect(composerCss).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(composerCss).not.toMatch(/\b(?:box-)?shadow\b/);
  });
});
