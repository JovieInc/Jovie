import { describe, expect, it } from 'vitest';
import type { ProfileWorkspaceSurfaceRow } from '@/components/features/presence/types';
import { buildPresenceHealth, fixChatHref, fixForRow } from './adapter';

const NOW = new Date('2026-10-29T12:00:00Z');
const canonical = { handle: 'tim', bio: '', photoHash: '' };

function row(
  over: Partial<ProfileWorkspaceSurfaceRow>
): ProfileWorkspaceSurfaceRow {
  return {
    id: 's1',
    rowType: 'surface',
    kind: 'social',
    platform: 'instagram',
    label: 'Instagram',
    handle: null,
    url: 'https://instagram.com/tim',
    trackedUrl: null,
    qualificationStatus: 'qualified',
    isOfficial: true,
    monitoringState: 'active',
    rank: null,
    previousRank: null,
    lastObservedAt: '2026-10-28T00:00:00Z',
    ...over,
  };
}

describe('buildPresenceHealth', () => {
  it('derives statuses and link-out coverage from real rows only', () => {
    const { rows, metrics } = buildPresenceHealth(
      {
        rows: [
          row({ linksOut: true }),
          row({ id: 's2', platform: 'twitter', linksOut: false }),
          row({
            id: 's3',
            platform: 'tiktok',
            qualificationStatus: 'conflicting',
          }),
          row({ id: 's4', kind: 'jovie', platform: 'jovie' }),
          row({
            id: 's5',
            platform: 'youtube',
            qualificationStatus: 'suggested',
          }),
        ],
      },
      { mode: 'personal', canonical, now: NOW }
    );
    const by = Object.fromEntries(rows.map(r => [r.platform, r.status]));
    expect(by).toEqual({
      instagram: 'verified',
      x: 'out_of_date',
      tiktok: 'inconsistent',
      youtube: 'missing',
    });
    expect(metrics.outboundCoverage).toBe(50);
    expect(metrics.inboundCoverage).toBeNull();
    expect(metrics.verifiedPct).toBe(25);
  });
});

describe('fixForRow', () => {
  it('proposes one approvable fix for an unhealthy owned row', () => {
    const fix = fixForRow(
      row({ platform: 'twitter', linksOut: false }),
      'personal',
      NOW
    );
    expect(fix?.issue.kind).toBe('jovie_does_not_link_out');
    expect(fix?.requiresApproval).toBe(true);
    expect(fix && fixChatHref(fix)).toContain('/app/chat?q=');
  });
  it('proposes nothing for healthy or unowned rows (no dead ends)', () => {
    expect(fixForRow(row({ linksOut: true }), 'personal', NOW)).toBeNull();
    expect(
      fixForRow(row({ qualificationStatus: 'suggested' }), 'personal', NOW)
    ).toBeNull();
  });
});
