import { describe, expect, it } from 'vitest';
import {
  buildProfileAccentCssVars,
  mergeProfileTheme,
  readProfileAccentTheme,
} from '@/lib/profile/profile-theme';

describe('profile theme helpers', () => {
  it('reads a valid stored profile accent', () => {
    expect(
      readProfileAccentTheme({
        profileAccent: {
          version: 1,
          primaryHex: '#d3834e',
          sourceUrl: 'https://example.com/avatar.jpg',
          generatedAt: '2026-04-24T00:00:00.000Z',
        },
      })
    ).toEqual({
      version: 1,
      primaryHex: '#d3834e',
      sourceUrl: 'https://example.com/avatar.jpg',
      generatedAt: '2026-04-24T00:00:00.000Z',
    });
  });

  it('preserves existing accent data when merging a theme mode change', () => {
    expect(
      mergeProfileTheme(
        {
          profileAccent: {
            version: 1,
            primaryHex: '#d3834e',
            sourceUrl: 'https://example.com/avatar.jpg',
          },
        },
        { mode: 'dark' }
      )
    ).toEqual({
      mode: 'dark',
      profileAccent: {
        version: 1,
        primaryHex: '#d3834e',
        sourceUrl: 'https://example.com/avatar.jpg',
      },
    });
  });

  it('maps accent tokens into the shared shell css vars', () => {
    const vars = buildProfileAccentCssVars({
      version: 1,
      primaryHex: '#d3834e',
      sourceUrl: 'https://example.com/avatar.jpg',
    });

    expect(vars).toMatchObject({
      '--profile-tab-active-bg': expect.stringMatching(/^#/),
      '--profile-status-pill-bg': expect.stringContaining('rgba'),
      '--profile-rail-dot-active': expect.stringMatching(/^#/),
      '--profile-dock-bg': expect.stringContaining('rgba'),
      '--profile-pearl-primary-bg': expect.stringMatching(/^#/),
    });
  });

  it('uses AA contrast text for medium-bright accent buttons', () => {
    const vars = buildProfileAccentCssVars({
      version: 1,
      primaryHex: '#cf824c',
      sourceUrl: 'https://example.com/avatar.jpg',
    });

    expect(vars['--profile-pearl-primary-fg']).toBe('#0f172a');
  });

  it('falls back to black when slate text is not AA-safe', () => {
    const vars = buildProfileAccentCssVars({
      version: 1,
      primaryHex: '#888888',
      sourceUrl: 'https://example.com/avatar.jpg',
    });

    expect(vars['--profile-pearl-primary-fg']).toBe('#000000');
  });
});
