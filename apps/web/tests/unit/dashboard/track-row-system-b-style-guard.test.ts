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

describe('TrackRow System B style guard', () => {
  it('keeps TrackRow source on named System B primitives', () => {
    const source = readFileSync(
      path.join(
        webRoot,
        'components/features/dashboard/organisms/release-provider-matrix/components/TrackRow.tsx'
      ),
      'utf8'
    );
    const offenders = rawComponentVisualPatterns
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.toString());

    expect(offenders, `TrackRow leaked ${offenders.join(', ')}`).toEqual([]);
    expect(source).toContain('system-b-track-row');
    expect(source).toContain('system-b-track-row--selected');
    expect(source).toContain('system-b-track-row-stack-card');
    expect(source).toContain('system-b-track-row-empty-table');
  });

  it('keeps TrackRow primitives token-backed', () => {
    const source = readFileSync(
      path.join(webRoot, 'styles/design-system.css'),
      'utf8'
    );
    const trackRowCss = source.match(
      /:where\(\.system-b-track-row\)[\s\S]*?\.system-b-dsp-status-dot-live/
    )?.[0];

    expect(trackRowCss).toBeDefined();
    expect(trackRowCss).toContain('var(--system-b-app-content-surface)');
    expect(trackRowCss).toContain('var(--system-b-app-frame-seam)');
    expect(trackRowCss).toContain('var(--system-b-bg-page)');
    expect(trackRowCss).toContain('var(--color-border-focus)');
    expect(trackRowCss).toContain('.system-b-track-row-stack-rail');
    expect(trackRowCss).toContain('.system-b-track-row-table-rail');
    expect(trackRowCss).not.toMatch(/--linear-/);
    expect(trackRowCss).not.toMatch(/\brgba?\(/i);
    expect(trackRowCss).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(trackRowCss).not.toMatch(/(?:radial|linear)-gradient/i);
  });
});
