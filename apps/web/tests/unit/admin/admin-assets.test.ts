import { describe, expect, it } from 'vitest';
import {
  ADMIN_PEOPLE_VIEW_LABELS,
  adminPeopleViews,
} from '@/constants/admin-navigation';
import {
  type AdminAssetSort,
  adminAssetIssuesFilters,
  adminAssetSortFields,
  adminAssetTypes,
  adminAssetVerifiedFilters,
} from '@/lib/admin/assets';
import {
  adminAssetTypes as adminAssetTypeParams,
  adminPeopleSearchParams,
} from '@/lib/nuqs';

describe('admin asset library constants', () => {
  it('covers every content asset subsystem', () => {
    expect([...adminAssetTypes]).toEqual(['release', 'track', 'link', 'photo']);
  });

  it('exposes issues and verification filters', () => {
    expect([...adminAssetIssuesFilters]).toEqual(['all', 'issues']);
    expect([...adminAssetVerifiedFilters]).toEqual([
      'all',
      'verified',
      'unverified',
    ]);
  });

  it('sorts by created date and title', () => {
    const expected: AdminAssetSort[] = [
      'created_desc',
      'created_asc',
      'title_asc',
      'title_desc',
    ];
    expect([...adminAssetSortFields]).toEqual(expected);
  });
});

describe('admin people assets view', () => {
  it('is a registered people view with a label', () => {
    expect(adminPeopleViews).toContain('assets');
    expect(ADMIN_PEOPLE_VIEW_LABELS.assets).toBe('Assets');
  });

  it('parses asset filter params with safe defaults', async () => {
    const params = await adminPeopleSearchParams.parse({
      view: 'assets',
      type: 'release',
      issues: 'issues',
      verified: 'verified',
    });
    expect(params.view).toBe('assets');
    expect(params.type).toBe('release');
    expect(params.issues).toBe('issues');
    expect(params.verified).toBe('verified');
  });

  it('falls back to defaults for unknown asset filters', async () => {
    const params = await adminPeopleSearchParams.parse({
      view: 'assets',
      type: 'bogus',
      issues: 'bogus',
      verified: 'bogus',
    });
    expect(params.type).toBe('all');
    expect(params.issues).toBe('all');
    expect(params.verified).toBe('all');
  });

  it('nuqs type param includes an all option beyond the concrete types', () => {
    expect(adminAssetTypeParams).toContain('all');
    expect(adminAssetTypeParams).toContain('release');
    expect(adminAssetTypeParams).toContain('track');
    expect(adminAssetTypeParams).toContain('link');
    expect(adminAssetTypeParams).toContain('photo');
  });
});
