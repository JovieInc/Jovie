import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

const rawComponentVisualPatterns = [
  /\b(?:bg|border|text|ring|shadow|outline|rounded|h|w|max-w|min-h|min-w|tracking|leading|px|py|pt|pb)-\[[^\]]+\]/,
  /color-mix\(/i,
  /--linear-/,
  /\brgba?\(/i,
  /#[0-9A-Fa-f]{3,8}\b/,
  /duration-150/,
  /\bshadow-\[/,
];

function readWebFile(relativePath: string) {
  return readFileSync(path.join(webRoot, relativePath), 'utf8');
}

describe('ReleaseTable System B style guard', () => {
  it('keeps ReleaseTable row source on named System B primitives', () => {
    const sources = [
      readWebFile(
        'components/features/dashboard/organisms/release-provider-matrix/ReleaseTable.tsx'
      ),
      readWebFile(
        'components/features/dashboard/organisms/release-provider-matrix/ReleaseTableWithTracks.tsx'
      ),
      readWebFile(
        'components/features/dashboard/organisms/release-provider-matrix/release-table-row-styles.ts'
      ),
    ].join('\n');

    const offenders = rawComponentVisualPatterns
      .filter(pattern => pattern.test(sources))
      .map(pattern => pattern.toString());

    expect(offenders, `ReleaseTable leaked ${offenders.join(', ')}`).toEqual(
      []
    );
    expect(sources).toContain('system-b-release-table-row');
    expect(sources).toContain('system-b-release-table-row--selected');
    expect(sources).toContain('system-b-release-table-row--expanded');
    expect(sources).toContain('system-b-release-table-track-stack');
    expect(sources).toContain('system-b-release-table-empty-state');
  });

  it('keeps ReleaseTable primitives token-backed', () => {
    const source = readWebFile('styles/design-system.css');
    const releaseTableCss = source.match(
      /\.system-b-release-table-row[\s\S]*?:where\(\.system-b-track-row\)/
    )?.[0];

    expect(releaseTableCss).toBeDefined();
    expect(releaseTableCss).toContain('var(--system-b-app-content-surface)');
    expect(releaseTableCss).toContain('var(--system-b-app-frame-seam)');
    expect(releaseTableCss).toContain('var(--system-b-bg-page)');
    expect(releaseTableCss).toContain('var(--color-border-focus)');
    expect(releaseTableCss).toContain('var(--color-text-primary-token)');
    expect(releaseTableCss).toContain('var(--color-success)');
    expect(releaseTableCss).toContain(
      '.system-b-release-table-row--idle:hover'
    );
    expect(releaseTableCss).toContain(
      '.system-b-release-table-row--selected:focus-within'
    );
    expect(releaseTableCss).toContain(
      '.system-b-release-table-row--expanded:hover'
    );
    expect(releaseTableCss).toContain('.system-b-release-table-track-stack');
    expect(releaseTableCss).toContain('.system-b-release-table-empty-state');
    expect(releaseTableCss).not.toMatch(/--linear-/);
    expect(releaseTableCss).not.toMatch(/\brgba?\(/i);
    expect(releaseTableCss).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(releaseTableCss).not.toMatch(/(?:radial|linear)-gradient/i);
  });
});
