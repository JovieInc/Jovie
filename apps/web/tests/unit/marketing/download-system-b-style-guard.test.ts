import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSourcePath = 'app/(marketing)/download/page.tsx';
const designSystemPath = 'styles/design-system.css';

const forbiddenRouteVisualPatterns = [
  /#[0-9a-fA-F]{3,8}/,
  /rgba?\(/,
  /hsla?\(/,
  /linear-gradient|radial-gradient/,
  /\b(?:bg|border|text|ring|shadow|decoration)-\[/,
  /\b(?:rounded|text|h|w|max-w|min-h|tracking|leading|px|py|pt|pb|z)-\[/,
  /\b(?:emerald|fuchsia|amber|sky|indigo|orange|rose|cyan|violet|red|black|white)-(?:[0-9]|\[|\/)/,
  /system-b-download-/,
] as const;
const forbiddenImportedDecorationPatterns = [
  /\bhomepage-hero(?:-[\w-]+|__[\w-]+)?\b/,
] as const;
const forbiddenStaticBypassPatterns = [
  /fetchLatestDesktopRelease/,
  /@\/lib\/desktop\/github-releases/,
  /async\s+function\s+DownloadPage/,
] as const;
const requiredSharedPrimitives = [
  'MarketingContainer',
  'homepage-section-eyebrow',
  'public-action-primary',
  'public-action-secondary',
  'FaqSection',
] as const;

describe('download page System B source contract', () => {
  it('keeps download page visuals on named System B primitives', () => {
    const source = readFileSync(resolve(process.cwd(), pageSourcePath), 'utf8');

    for (const pattern of forbiddenRouteVisualPatterns) {
      expect(source, `${pageSourcePath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }
  });

  it('reuses shared marketing primitives instead of a page CSS layer', () => {
    const source = readFileSync(resolve(process.cwd(), pageSourcePath), 'utf8');
    for (const token of requiredSharedPrimitives) {
      expect(source, `missing shared primitive ${token}`).toContain(token);
    }
  });

  it('does not import homepage hero decoration into download', () => {
    const source = readFileSync(resolve(process.cwd(), pageSourcePath), 'utf8');

    for (const pattern of forbiddenImportedDecorationPatterns) {
      expect(source, `${pageSourcePath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }
  });

  it('keeps live desktop release lookup out of the static render path', () => {
    const source = readFileSync(resolve(process.cwd(), pageSourcePath), 'utf8');

    for (const pattern of forbiddenStaticBypassPatterns) {
      expect(source, `${pageSourcePath} matched ${pattern}`).not.toMatch(
        pattern
      );
    }
  });

  it('removes the page-scoped system-b-download CSS block', () => {
    const source = readFileSync(
      resolve(process.cwd(), designSystemPath),
      'utf8'
    );
    expect(source).not.toContain('system-b-download');
  });
});
