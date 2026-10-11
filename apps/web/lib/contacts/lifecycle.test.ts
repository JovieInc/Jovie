import { describe, expect, it } from 'vitest';
import {
  type CanonicalContactSourceRow,
  contactDedupeKey,
  contactLifecycleStageRank,
  deriveContactStage,
  getContactLifecycleStageLabel,
  isContactLifecycleStage,
  mergeCanonicalContacts,
} from './lifecycle';

describe('contactDedupeKey', () => {
  it('prefers normalized email over handle', () => {
    expect(
      contactDedupeKey({ email: '  Tim@Example.com ', handle: 'tim' })
    ).toBe('email:tim@example.com');
  });

  it('falls back to normalized handle', () => {
    expect(contactDedupeKey({ handle: ' @TimWhite/ ' })).toBe(
      'handle:timwhite'
    );
  });

  it('returns null with no usable identity', () => {
    expect(contactDedupeKey({ email: 'not-an-email' })).toBeNull();
    expect(contactDedupeKey({})).toBeNull();
  });

  it('merges rows that share a normalized email', () => {
    const a = contactDedupeKey({ email: 'a@b.com' });
    const b = contactDedupeKey({ email: 'A@B.COM' });
    expect(a).toBe(b);
  });
});

describe('deriveContactStage', () => {
  it('defaults to suggested', () => {
    expect(deriveContactStage({})).toBe('suggested');
    expect(deriveContactStage({ waitlistStatus: 'waitlisted' })).toBe(
      'suggested'
    );
    expect(deriveContactStage({ leadStatus: 'discovered' })).toBe('suggested');
  });

  it('maps approval signals', () => {
    expect(deriveContactStage({ waitlistStatus: 'approved' })).toBe('approved');
    expect(deriveContactStage({ leadStatus: 'ingested' })).toBe('approved');
    // A waitlist-gated user row still means an account was created.
    expect(deriveContactStage({ userStatus: 'waitlist_approved' })).toBe(
      'signed_up'
    );
  });

  it('maps outreach signals', () => {
    expect(deriveContactStage({ outreachStarted: true })).toBe('outreach');
    expect(deriveContactStage({ waitlistStatus: 'invited' })).toBe('outreach');
  });

  it('maps profile and certification signals', () => {
    expect(deriveContactStage({ profileExists: true })).toBe('profile_created');
    expect(deriveContactStage({ certified: true })).toBe('certified');
    expect(deriveContactStage({ certified: true, profileExists: true })).toBe(
      'certified'
    );
  });

  it('maps signup, claim, activation, paying, and churn in order', () => {
    expect(deriveContactStage({ userStatus: 'onboarding_incomplete' })).toBe(
      'signed_up'
    );
    expect(deriveContactStage({ userStatus: 'profile_claimed' })).toBe(
      'claimed'
    );
    expect(deriveContactStage({ userStatus: 'active' })).toBe('activated');
    expect(deriveContactStage({ userStatus: 'active', isPaying: true })).toBe(
      'paying'
    );
    expect(
      deriveContactStage({
        userStatus: 'active',
        isPaying: true,
        userDeleted: true,
      })
    ).toBe('churned');
  });

  it('certification never masks a later stage', () => {
    expect(deriveContactStage({ certified: true, userStatus: 'active' })).toBe(
      'activated'
    );
  });

  it('treats waitlist signup as signed_up even without a user row', () => {
    expect(deriveContactStage({ waitlistStatus: 'signed_up' })).toBe(
      'signed_up'
    );
    expect(deriveContactStage({ leadSignedUp: true })).toBe('signed_up');
  });
});

describe('mergeCanonicalContacts', () => {
  const base: CanonicalContactSourceRow = {
    dedupeKey: 'email:a@b.com',
    stage: 'suggested',
    displayName: null,
    email: 'a@b.com',
    handle: null,
    avatarUrl: null,
    source: 'waitlist',
    sourceId: 'w1',
    stageAt: new Date('2026-01-01'),
    activityAt: new Date('2026-01-01'),
  };

  it('dedupes sources for one person into a single row', () => {
    const rows: CanonicalContactSourceRow[] = [
      base,
      {
        ...base,
        stage: 'paying',
        displayName: 'Artist A',
        source: 'user',
        sourceId: 'u1',
        userId: 'u1',
        activityAt: new Date('2026-02-01'),
        stageAt: new Date('2026-02-01'),
      },
      {
        ...base,
        stage: 'outreach',
        source: 'lead',
        sourceId: 'l1',
        leadId: 'l1',
      },
    ];

    const merged = mergeCanonicalContacts(rows);
    expect(merged).toHaveLength(1);
    const contact = merged[0];
    expect(contact.stage).toBe('paying');
    expect(contact.displayName).toBe('Artist A');
    expect(contact.sources).toEqual(['lead', 'user', 'waitlist']);
    expect(contact.userId).toBe('u1');
    expect(contact.leadId).toBe('l1');
    expect(contact.waitlistEntryId).toBeNull();
    expect(contact.activityAt?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(contact.firstSeenAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps distinct people separate', () => {
    const merged = mergeCanonicalContacts([
      base,
      { ...base, dedupeKey: 'handle:solo', email: null, handle: 'solo' },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('churned wins over every other stage', () => {
    const merged = mergeCanonicalContacts([
      { ...base, stage: 'paying' },
      { ...base, stage: 'churned', source: 'user', sourceId: 'u1' },
    ]);
    expect(merged[0].stage).toBe('churned');
  });
});

describe('stage metadata', () => {
  it('recognizes only canonical stages', () => {
    expect(isContactLifecycleStage('certified')).toBe(true);
    expect(isContactLifecycleStage('waiting')).toBe(false);
    expect(isContactLifecycleStage(null)).toBe(false);
  });

  it('orders the funnel monotonically', () => {
    expect(contactLifecycleStageRank('suggested')).toBeLessThan(
      contactLifecycleStageRank('paying')
    );
    expect(contactLifecycleStageRank('churned')).toBeGreaterThan(
      contactLifecycleStageRank('paying')
    );
  });

  it('labels every stage', () => {
    expect(getContactLifecycleStageLabel('profile_created')).toBe(
      'Profile created'
    );
  });
});
