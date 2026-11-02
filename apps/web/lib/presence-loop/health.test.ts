import { describe, expect, it } from 'vitest';
import {
  buildPresenceRows,
  type CanonicalIdentity,
  classifyProfile,
  computeLoopMetrics,
  type ProfileObservation,
  proposeFix,
} from './health';

const NOW = new Date('2026-10-29T12:00:00Z');
const canonical: CanonicalIdentity = {
  handle: 'timwhite',
  bio: 'Founder. Runs, reads.',
  photoHash: 'p1',
};
const good: ProfileObservation = {
  platform: 'instagram',
  url: 'https://instagram.com/timwhite',
  qualified: true,
  reachable: true,
  handle: '@TimWhite',
  bio: 'Founder.  Runs, reads.',
  photoHash: 'p1',
  linksBackToJovie: true,
  jovieLinksOut: true,
  lastCheckedAt: new Date('2026-10-28T00:00:00Z'),
};

describe('classifyProfile', () => {
  it('verifies a correct, fresh, two-way-linked profile (case/space tolerant)', () => {
    const row = classifyProfile(good, canonical, NOW);
    expect(row.status).toBe('verified');
    expect(row.issues).toEqual([]);
  });
  it('flags broken links and skips content checks', () => {
    const row = classifyProfile(
      { ...good, reachable: false, bio: 'other' },
      canonical,
      NOW
    );
    expect(row.status).toBe('broken_link');
    expect(row.issues.map(i => i.kind)).toEqual(['broken_link']);
  });
  it('flags conflicting identity evidence as inconsistent', () => {
    expect(
      classifyProfile({ ...good, identityConflict: true }, canonical, NOW)
        .status
    ).toBe('inconsistent');
  });
  it('never guesses unobserved link state', () => {
    const row = classifyProfile(
      { ...good, linksBackToJovie: null, jovieLinksOut: null },
      canonical,
      NOW
    );
    expect(row.status).toBe('verified');
    expect(computeLoopMetrics([row]).linkWebCoverage).toBeNull();
  });
  it('flags handle, bio and photo drift as inconsistent', () => {
    const row = classifyProfile(
      { ...good, handle: 'tim_w', bio: 'x', photoHash: 'p2' },
      canonical,
      NOW
    );
    expect(row.status).toBe('inconsistent');
    expect(row.issues).toHaveLength(3);
  });
  it('flags checks older than 14 days, or never checked, as out of date', () => {
    expect(
      classifyProfile(
        { ...good, lastCheckedAt: new Date('2026-10-01T00:00:00Z') },
        canonical,
        NOW
      ).status
    ).toBe('out_of_date');
    expect(
      classifyProfile({ ...good, lastCheckedAt: null }, canonical, NOW).status
    ).toBe('out_of_date');
  });
  it('does not verify a profile missing the link back to Jovie', () => {
    const row = classifyProfile(
      { ...good, linksBackToJovie: false },
      canonical,
      NOW
    );
    expect(row.status).toBe('out_of_date');
    expect(row.issues[0]?.kind).toBe('no_link_back_to_jovie');
  });
});

describe('buildPresenceRows', () => {
  it('adds missing rows for expected platforms and sorts worst first', () => {
    const rows = buildPresenceRows({
      observations: [good, { ...good, platform: 'x', qualified: false }],
      expectedPlatforms: ['instagram', 'x', 'youtube'],
      canonical,
      now: NOW,
    });
    expect(rows.map(r => [r.platform, r.status])).toEqual([
      ['x', 'missing'],
      ['youtube', 'missing'],
      ['instagram', 'verified'],
    ]);
  });
});

describe('proposeFix', () => {
  it('always requires approval and never auto-posts', () => {
    const fix = proposeFix(
      { kind: 'bio_mismatch', platform: 'x', severity: 'medium' },
      'company'
    );
    expect(fix.requiresApproval).toBe(true);
    expect(fix.autoPost).toBe(false);
    expect(fix.copyRule).toBe('brand_voice');
  });
  it('keeps personal mode lifestyle-only', () => {
    const fix = proposeFix(
      { kind: 'no_link_back_to_jovie', platform: 'x', severity: 'medium' },
      'personal'
    );
    expect(fix.copyRule).toBe('lifestyle_only');
    expect(fix.agentTask).toContain('lifestyle_only');
  });
});

describe('computeLoopMetrics', () => {
  it('computes verified %, open issues and link-web coverage', () => {
    const rows = buildPresenceRows({
      observations: [
        good,
        { ...good, platform: 'x', linksBackToJovie: false },
        { ...good, platform: 'tiktok', jovieLinksOut: false },
      ],
      expectedPlatforms: ['instagram', 'x', 'tiktok', 'youtube'],
      canonical,
      now: NOW,
    });
    const m = computeLoopMetrics(rows);
    expect(m.profiles).toBe(4);
    expect(m.verifiedPct).toBe(25);
    expect(m.openIssues).toBe(3);
    expect(m.inboundCoverage).toBe(66.7);
    expect(m.outboundCoverage).toBe(66.7);
    expect(m.linkWebCoverage).toBe(66.7);
  });
  it('is zero-safe', () => {
    expect(computeLoopMetrics([]).verifiedPct).toBe(0);
  });
});
