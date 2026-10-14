import { describe, expect, it } from 'vitest';
import { buildCatalog } from './catalog';
import {
  SOCIALBLADE_CONTRACT_VERSION,
  SOCIALBLADE_PLATFORM_SPECS,
  SOCIALBLADE_PLATFORMS,
  SOCIALBLADE_ROWS,
  SOCIALBLADE_TERMS_URL,
} from './socialblade-rows';

describe('Social Blade documented capability inventory', () => {
  it('versions the current docs and developer terms review', () => {
    expect(SOCIALBLADE_CONTRACT_VERSION).toBe('2026-10-14');
    expect(SOCIALBLADE_TERMS_URL).toBe(
      'https://socialblade.com/info/developer-terms'
    );
    expect(SOCIALBLADE_PLATFORMS).toEqual([
      'facebook',
      'instagram',
      'tiktok',
      'twitch',
      'youtube',
    ]);
  });

  it('preserves platform-specific profile inputs and history depths', () => {
    expect(SOCIALBLADE_PLATFORM_SPECS.youtube.profileInputs).toEqual([
      'channelid (preferred)',
      'username',
      'cusername',
      '@handle',
    ]);
    expect(
      SOCIALBLADE_PLATFORM_SPECS.youtube.history.map(row => row.key)
    ).toEqual(['default', 'extended', 'archive']);

    for (const platform of [
      'facebook',
      'instagram',
      'tiktok',
      'twitch',
    ] as const) {
      expect(
        SOCIALBLADE_PLATFORM_SPECS[platform].history.map(row => row.key)
      ).toEqual(['default', 'extended', 'archive', 'vault']);
    }
    expect(
      SOCIALBLADE_PLATFORM_SPECS.instagram.history.map(row => row.maximumWindow)
    ).toEqual(['30 days', '1 year', '3 years', '10 years']);
  });

  it('does not generalize fields or top filters across platforms', () => {
    expect(SOCIALBLADE_PLATFORM_SPECS.youtube.fields.totals).toEqual([
      'uploads',
      'subscribers',
      'views',
    ]);
    expect(SOCIALBLADE_PLATFORM_SPECS.tiktok.fields.growth).toEqual([]);
    expect(SOCIALBLADE_PLATFORM_SPECS.facebook.fields.totals).toEqual([
      'likes',
      'talking_about',
    ]);
    expect(SOCIALBLADE_PLATFORM_SPECS.instagram.fields.daily).toContain(
      'avg_comments'
    );
    expect(SOCIALBLADE_PLATFORM_SPECS.twitch.fields.totals).toContain(
      'views (deprecated)'
    );
    expect(SOCIALBLADE_PLATFORM_SPECS.tiktok.topFilters).toEqual([
      'followers',
      'following',
      'likes',
      'sbrank',
      'videos',
    ]);
    expect(SOCIALBLADE_PLATFORM_SPECS.instagram.topFilters).toContain(
      'engagement-rate'
    );
  });

  it('emits unique sorted rows for every family without claiming a pass', () => {
    const ids = SOCIALBLADE_ROWS.map(
      row => `${row.platform}:${row.kind}:${row.key}`
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(68);
    expect(ids).toEqual([...ids].sort());

    for (const platform of SOCIALBLADE_PLATFORMS) {
      const rows = SOCIALBLADE_ROWS.filter(row => row.platform === platform);
      expect(rows.some(row => row.kind === 'statistics-fields')).toBe(true);
      expect(rows.some(row => row.kind === 'statistics-option')).toBe(true);
      expect(rows.some(row => row.kind === 'top-pagination')).toBe(true);
      expect(rows.some(row => row.kind === 'grade')).toBe(true);
      expect(rows.some(row => row.kind === 'sbrank')).toBe(true);
    }

    const catalogRows = buildCatalog().filter(
      row => row.vendor === 'socialblade'
    );
    expect(catalogRows).toHaveLength(SOCIALBLADE_ROWS.length);
    expect(catalogRows.every(row => row.admission.type === 'blocked')).toBe(
      true
    );
    expect(
      catalogRows.find(row => row.id.endsWith(':history:vault'))?.admission
    ).toMatchObject({
      type: 'blocked',
      status: 'historical-coverage-gap',
    });
    expect(
      catalogRows.find(row => row.id.endsWith(':top-filter:sbrank'))?.admission
    ).toMatchObject({
      type: 'blocked',
      status: 'vendor-only-opaque-metric',
    });
    expect(
      catalogRows.find(row => row.id.endsWith(':statistics-fields:documented'))
        ?.admission
    ).toMatchObject({ type: 'blocked', status: 'rights-blocked' });
  });
});
