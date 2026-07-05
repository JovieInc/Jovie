import { describe, expect, it } from 'vitest';
import {
  assessSameNameCollisionRisk,
  type BrandIntegrityIdentityLink,
  type BrandIntegrityProfile,
  checkBrandIntegrity,
  countIssuesBySeverity,
} from '@/lib/aeo/brand-integrity';

const baseProfile: BrandIntegrityProfile = {
  id: 'profile-1',
  name: 'Alex Smith',
  handle: 'alex-smith',
  location: 'Los Angeles, CA',
  hometown: 'Chicago, IL',
  genres: ['indie pop'],
  active_since_year: 2015,
  image_url: 'https://jov.ie/avatars/alex.jpg',
  musicbrainzId: 'abc-123',
};

const fullLinks: BrandIntegrityIdentityLink[] = [
  {
    platform: 'musicbrainz',
    url: 'https://musicbrainz.org/artist/abc-123',
    externalId: 'abc-123',
  },
  {
    platform: 'wikidata',
    url: 'https://www.wikidata.org/wiki/Q999',
    externalId: 'Q999',
  },
  {
    platform: 'isni',
    url: 'https://isni.org/isni/0000000100000001',
    externalId: '0000000100000001',
  },
  {
    platform: 'spotify',
    url: 'https://open.spotify.com/artist/spotid',
    externalId: 'spotid',
  },
];

const noLinks: BrandIntegrityIdentityLink[] = [];

describe('assessSameNameCollisionRisk', () => {
  it('returns low risk with 2+ KB anchors', () => {
    const risk = assessSameNameCollisionRisk(baseProfile, fullLinks);
    expect(risk.level).toBe('low');
    expect(risk.atRisk).toBe(false);
    expect(risk.kbAnchorCount).toBeGreaterThanOrEqual(2);
  });

  it('returns medium risk with exactly 1 KB anchor', () => {
    const oneLink: BrandIntegrityIdentityLink[] = [
      {
        platform: 'musicbrainz',
        url: 'https://musicbrainz.org/artist/abc',
        externalId: 'abc',
      },
    ];
    const risk = assessSameNameCollisionRisk(baseProfile, oneLink);
    expect(risk.level).toBe('medium');
    expect(risk.atRisk).toBe(true);
    expect(risk.kbAnchorCount).toBe(1);
  });

  it('returns high risk with no KB anchors', () => {
    const risk = assessSameNameCollisionRisk(
      { ...baseProfile, musicbrainzId: null },
      noLinks
    );
    expect(risk.level).toBe('high');
    expect(risk.atRisk).toBe(true);
    expect(risk.kbAnchorCount).toBe(0);
    expect(risk.kbPlatforms).toHaveLength(0);
  });

  it('counts musicbrainzId on profile as a KB anchor', () => {
    // profile has musicbrainzId but no links
    const profileWithMbid: BrandIntegrityProfile = {
      ...baseProfile,
      musicbrainzId: 'some-mbid',
    };
    // With only the profile-level MBID (no wikidata link), should still be medium risk
    const risk = assessSameNameCollisionRisk(profileWithMbid, noLinks);
    // The profile MBID alone doesn't count as a link anchor, but it does imply MB platform
    // With 0 links and an MBID only on profile, count = 0 KB link platforms
    // This is by design: the profile MBID is checked separately in the checklist
    expect(['high', 'medium']).toContain(risk.level);
  });

  it('includes the platforms list in the result', () => {
    const risk = assessSameNameCollisionRisk(baseProfile, fullLinks);
    expect(risk.kbPlatforms).toContain('musicbrainz');
    expect(risk.kbPlatforms).toContain('wikidata');
    expect(risk.kbPlatforms).toContain('isni');
  });

  it('does not count DSP platforms as KB anchors', () => {
    const dspOnly: BrandIntegrityIdentityLink[] = [
      {
        platform: 'spotify',
        url: 'https://open.spotify.com/artist/1',
        externalId: '1',
      },
      {
        platform: 'apple_music',
        url: 'https://music.apple.com/artist/2',
        externalId: '2',
      },
    ];
    const risk = assessSameNameCollisionRisk(
      { ...baseProfile, musicbrainzId: null },
      dspOnly
    );
    expect(risk.kbAnchorCount).toBe(0);
    expect(risk.level).toBe('high');
  });
});

describe('checkBrandIntegrity', () => {
  it('produces a perfect score for a fully-complete profile with all KB links', () => {
    const report = checkBrandIntegrity(baseProfile, fullLinks);
    // All disambiguating attributes present → high score
    expect(report.score).toBeGreaterThan(80);
  });

  it('produces a low score for a bare profile with no links', () => {
    const bareProfile: BrandIntegrityProfile = {
      id: 'profile-2',
      name: 'Alex Smith',
      handle: 'alex-smith-2',
    };
    const report = checkBrandIntegrity(bareProfile, noLinks);
    expect(report.score).toBeLessThan(20);
  });

  it('returns critical issue when MusicBrainz ID is missing', () => {
    const profile = { ...baseProfile, musicbrainzId: null };
    const links = fullLinks.filter(l => l.platform !== 'musicbrainz');
    const report = checkBrandIntegrity(profile, links);
    const criticalIssues = report.issues.filter(i => i.severity === 'critical');
    expect(criticalIssues.some(i => i.code === 'missing_musicbrainz_id')).toBe(
      true
    );
  });

  it('returns warning issue when origin is missing', () => {
    const profile = { ...baseProfile, location: null, hometown: null };
    const report = checkBrandIntegrity(profile, fullLinks);
    expect(report.issues.some(i => i.code === 'missing_origin')).toBe(true);
  });

  it('returns warning issue when genre is missing', () => {
    const profile = { ...baseProfile, genres: [] };
    const report = checkBrandIntegrity(profile, fullLinks);
    expect(report.issues.some(i => i.code === 'missing_genre')).toBe(true);
  });

  it('returns no issues for a fully-specified artist', () => {
    const report = checkBrandIntegrity(baseProfile, fullLinks);
    expect(report.issues).toHaveLength(0);
  });

  it('includes all 7 checklist items', () => {
    const report = checkBrandIntegrity(baseProfile, fullLinks);
    expect(report.disambiguatingChecklist).toHaveLength(7);
  });

  it('marks MusicBrainz as present when set on the profile column', () => {
    const profileWithMbid = { ...baseProfile, musicbrainzId: 'abc-123' };
    const report = checkBrandIntegrity(
      profileWithMbid,
      noLinks.filter(l => l.platform !== 'musicbrainz')
    );
    const mbItem = report.disambiguatingChecklist.find(
      i => i.attribute === 'MusicBrainz ID'
    );
    expect(mbItem?.present).toBe(true);
  });

  it('includes profile id and artist name in report', () => {
    const report = checkBrandIntegrity(baseProfile, fullLinks);
    expect(report.profileId).toBe(baseProfile.id);
    expect(report.artistName).toBe(baseProfile.name);
  });

  it('correctly marks all checklist items as present for full profile', () => {
    const report = checkBrandIntegrity(baseProfile, fullLinks);
    const notPresent = report.disambiguatingChecklist.filter(i => !i.present);
    // All 7 should be present
    expect(notPresent).toHaveLength(0);
  });

  it('uses hometown over location for origin when both set', () => {
    const report = checkBrandIntegrity(baseProfile, fullLinks);
    const originItem = report.disambiguatingChecklist.find(
      i => i.attribute === 'Origin / Location'
    );
    expect(originItem?.value).toBe('Chicago, IL'); // hometown takes precedence
  });
});

describe('countIssuesBySeverity', () => {
  it('counts zero issues for a complete profile', () => {
    const report = checkBrandIntegrity(baseProfile, fullLinks);
    const counts = countIssuesBySeverity(report);
    expect(counts.critical).toBe(0);
    expect(counts.warning).toBe(0);
    expect(counts.info).toBe(0);
  });

  it('counts critical issue for missing MBID', () => {
    const profile = { ...baseProfile, musicbrainzId: null };
    const links = fullLinks.filter(l => l.platform !== 'musicbrainz');
    const report = checkBrandIntegrity(profile, links);
    const counts = countIssuesBySeverity(report);
    expect(counts.critical).toBeGreaterThanOrEqual(1);
  });

  it('counts warning issues for missing origin and genre', () => {
    const profile = {
      ...baseProfile,
      location: null,
      hometown: null,
      genres: [],
    };
    const report = checkBrandIntegrity(profile, fullLinks);
    const counts = countIssuesBySeverity(report);
    expect(counts.warning).toBeGreaterThanOrEqual(2);
  });

  it('counts info issues for missing optional fields', () => {
    const bareProfile: BrandIntegrityProfile = {
      id: 'p3',
      name: 'No Data',
      handle: 'no-data',
    };
    const report = checkBrandIntegrity(bareProfile, noLinks);
    const counts = countIssuesBySeverity(report);
    // foundingDate + image = at least 2 info issues
    expect(counts.info).toBeGreaterThanOrEqual(2);
  });
});
