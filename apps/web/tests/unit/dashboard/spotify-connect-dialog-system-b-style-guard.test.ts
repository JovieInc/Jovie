import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

const rawComponentVisualPatterns = [
  /\b(?:bg|border|text|ring|shadow|outline|rounded|h|w|max-w|min-h|min-w|tracking|leading|px|py|pt|pb)-\[[^\]]+\]/,
  /\b(?:bg|border|ring|text)-\(--[^)]+\)/,
  /color-mix\(/i,
  /--linear-/,
  /\brgba?\(/i,
  /#[0-9A-Fa-f]{3,8}\b/,
  /duration-150/,
  /\bshadow-\[/,
  /text-white\/60/,
];

function readWebFile(relativePath: string) {
  return readFileSync(path.join(webRoot, relativePath), 'utf8');
}

describe('SpotifyConnectDialog System B style guard', () => {
  it('keeps dialog source on named System B primitives', () => {
    const source = readWebFile(
      'components/features/dashboard/organisms/release-provider-matrix/SpotifyConnectDialog.tsx'
    );
    const offenders = rawComponentVisualPatterns
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.toString());

    expect(
      offenders,
      `SpotifyConnectDialog leaked ${offenders.join(', ')}`
    ).toEqual([]);
    expect(source).toContain('system-b-spotify-connect-card');
    expect(source).toContain('system-b-spotify-connect-input-shell');
    expect(source).toContain('system-b-spotify-connect-trailing');
    expect(source).toContain('system-b-spotify-connect-dropdown');
    expect(source).toContain('system-b-spotify-connect-result-row');
    expect(source).toContain('system-b-spotify-connect-paste-row');
  });

  it('keeps dialog primitives token-backed', () => {
    const source = readWebFile('styles/design-system.css');
    const spotifyConnectCss = source.match(
      /:where\(\.system-b-spotify-connect-card\)[\s\S]*?(?=\.system-b-release-provider-banner)/
    )?.[0];

    expect(spotifyConnectCss).toBeDefined();
    expect(spotifyConnectCss).toContain('var(--system-b-app-content-surface)');
    expect(spotifyConnectCss).toContain('var(--system-b-app-frame-seam)');
    expect(spotifyConnectCss).toContain('var(--system-b-bg-page)');
    expect(spotifyConnectCss).toContain('var(--color-border-focus)');
    expect(spotifyConnectCss).toContain('var(--shadow-popover)');
    expect(spotifyConnectCss).toContain(
      '.system-b-spotify-connect-input-shell--active'
    );
    expect(spotifyConnectCss).toContain('.system-b-spotify-connect-trailing');
    expect(spotifyConnectCss).toContain(
      '.system-b-spotify-connect-result-row--interactive:hover'
    );
    expect(spotifyConnectCss).not.toMatch(/--linear-/);
    expect(spotifyConnectCss).not.toMatch(/\brgba?\(/i);
    expect(spotifyConnectCss).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(spotifyConnectCss).not.toMatch(/(?:radial|linear)-gradient/i);
  });
});
