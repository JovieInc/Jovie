import { describe, expect, it } from 'vitest';
import { isInternalOrTestAccountEmail } from '@/lib/utils/email';
import {
  buildReleaseEmailCanaryRefusal,
  buildReleaseEmailCanaryReleaseTitle,
  buildReleaseEmailCanaryRunId,
  evaluateReleaseEmailCanary,
  isReleaseEmailCanaryArtistEmail,
  isReleaseEmailCanaryRecipient,
  isReleaseEmailCanarySubscriberEmail,
  RELEASE_EMAIL_CANARY_DELIVERY_SLA_MS,
  type ReleaseEmailCanaryObservation,
  readReleaseEmailCanaryScope,
} from './release-email';

const PROFILE_ID = '0de33b39-ebcf-42ef-bcdd-c22bd8577368';
const INBOX = 'release-canary+synthetic-release-email@jovie.fm';
const ARTIST = 'release-canary+synthetic-release-artist@jovie.fm';
const scope = readReleaseEmailCanaryScope({
  RELEASE_EMAIL_CANARY_PROFILE_ID: PROFILE_ID,
  RELEASE_EMAIL_CANARY_INBOX: INBOX,
});
describe('release-email canary identities', () => {
  it('quarantines both canary identities from customer metrics', () => {
    expect(isInternalOrTestAccountEmail(INBOX)).toBe(true);
    expect(isInternalOrTestAccountEmail(ARTIST)).toBe(true);
    expect(isReleaseEmailCanarySubscriberEmail(INBOX)).toBe(true);
    expect(isReleaseEmailCanaryArtistEmail(ARTIST)).toBe(true);
    expect(isReleaseEmailCanarySubscriberEmail(ARTIST)).toBe(false);
    expect(isReleaseEmailCanaryArtistEmail(INBOX)).toBe(false);
  });
  it('rejects real or differently tagged addresses', () => {
    for (const email of [
      'fan@gmail.com',
      'release-canary@jovie.fm',
      'x+synthetic-grokbot@jovie.fm',
      'x+synthetic-release-emailx@jovie.fm',
    ]) {
      expect(isReleaseEmailCanarySubscriberEmail(email)).toBe(false);
    }
  });
});
describe('readReleaseEmailCanaryScope (fail closed)', () => {
  it('returns the normalized scope when both values are valid', () => {
    expect(scope).toEqual({
      creatorProfileId: PROFILE_ID,
      recipientEmail: INBOX,
    });
  });
  it.each([
    [{}],
    [{ RELEASE_EMAIL_CANARY_PROFILE_ID: PROFILE_ID }],
    [{ RELEASE_EMAIL_CANARY_INBOX: INBOX }],
    [
      {
        RELEASE_EMAIL_CANARY_PROFILE_ID: 'not-a-uuid',
        RELEASE_EMAIL_CANARY_INBOX: INBOX,
      },
    ],
    [
      {
        RELEASE_EMAIL_CANARY_PROFILE_ID: PROFILE_ID,
        RELEASE_EMAIL_CANARY_INBOX: 'real.subscriber@gmail.com',
      },
    ],
  ])('returns null for %o', env => {
    expect(readReleaseEmailCanaryScope(env)).toBeNull();
  });
});
describe('isReleaseEmailCanaryRecipient', () => {
  const target = {
    creatorProfileId: PROFILE_ID,
    channel: 'email',
    email: INBOX,
  };
  it('admits only the configured profile, email channel and inbox', () => {
    expect(isReleaseEmailCanaryRecipient(scope, target)).toBe(true);
    expect(
      isReleaseEmailCanaryRecipient(scope, {
        ...target,
        email: INBOX.toUpperCase(),
      })
    ).toBe(true);
  });
  it.each([
    ['no scope', null, target],
    [
      'another profile',
      scope,
      { ...target, creatorProfileId: '8473a72f-51a0-4ce0-8739-4facfd89a7a5' },
    ],
    ['sms channel', scope, { ...target, channel: 'sms' }],
    ['a real subscriber', scope, { ...target, email: 'fan@gmail.com' }],
    ['a missing email', scope, { ...target, email: null }],
  ])('refuses %s', (_label, s, t) => {
    expect(isReleaseEmailCanaryRecipient(s, t)).toBe(false);
  });
});
describe('evaluateReleaseEmailCanary', () => {
  const runAt = new Date('2026-10-29T18:00:00.000Z');
  const created = new Date('2026-10-29T17:00:00.000Z');
  const runId = buildReleaseEmailCanaryRunId(created);
  const title = buildReleaseEmailCanaryReleaseTitle(runId);
  const smartLinkUrl = `https://jov.ie/release-canary/${runId}`;
  const base: ReleaseEmailCanaryObservation = {
    runAt,
    deployedSha: 'abc123',
    pending: {
      schemaVersion: 1,
      runId,
      releaseId: '6f1c2c3e-1d2b-4c5d-8e9f-0a1b2c3d4e5f',
      releaseTitle: title,
      releaseCreatedAt: created.toISOString(),
      smartLinkUrl,
      deployedSha: 'abc123',
    },
    notification: {
      id: 'b2a1c3d4-0000-4000-8000-000000000001',
      status: 'sent',
      createdAt: new Date(created.getTime() + 60_000),
      sentAt: new Date(created.getTime() + 120_000),
    },
    providerMessageId: 're_123',
    inboxMessages: [
      {
        receivedAt: new Date(created.getTime() + 180_000),
        subject: `New release: ${title}`,
        bodyHtml: `<a href="${smartLinkUrl}">Listen</a> <a href="https://jov.ie/unsubscribe/x">Unsubscribe</a>`,
      },
    ],
    nextRunId: 'rel-20261029180000',
  };
  it('passes with stage latencies when exactly one correct email arrived in the SLA', () => {
    const receipt = evaluateReleaseEmailCanary(base);
    expect(receipt).toMatchObject({
      status: 'passed',
      failureReason: null,
      deployedSha: 'abc123',
      notificationId: base.notification?.id,
      providerMessageId: 're_123',
      latenciesMs: {
        schedule: 60_000,
        send: 60_000,
        delivered: 60_000,
        total: 180_000,
      },
    });
  });
  const pendingNote = {
    id: 'n',
    status: 'pending',
    createdAt: created,
    sentAt: null,
  };
  const delivered = base.inboxMessages?.[0];
  const late = new Date(
    created.getTime() + RELEASE_EMAIL_CANARY_DELIVERY_SLA_MS + 1
  );
  const duplicate = [delivered, delivered].filter(Boolean) as NonNullable<
    ReleaseEmailCanaryObservation['inboxMessages']
  >;
  const mismatch = [
    { receivedAt: runAt, subject: title, bodyHtml: '<p>no links</p>' },
  ];
  it.each<[string, Partial<ReleaseEmailCanaryObservation>]>([
    ['no_pending_run', { pending: null }],
    ['not_scheduled', { notification: null }],
    ['not_sent', { notification: pendingNote }],
    ['no_provider_message_id', { providerMessageId: null }],
    ['inbox_unavailable', { inboxMessages: null }],
    ['not_delivered', { inboxMessages: [] }],
    ['duplicate_delivery', { inboxMessages: duplicate }],
    ['content_mismatch', { inboxMessages: mismatch }],
    ['sla_exceeded', { inboxMessages: [{ ...delivered!, receivedAt: late }] }],
  ])('fails with %s', (reason, override) => {
    const receipt = evaluateReleaseEmailCanary({ ...base, ...override });
    expect(receipt.status).toBe('failed');
    expect(receipt.failureReason).toBe(reason);
  });
  it('records a refusal receipt when the canary is not configured', () => {
    expect(
      buildReleaseEmailCanaryRefusal(runAt, null, 'not_configured')
    ).toMatchObject({
      status: 'failed',
      failureReason: 'not_configured',
      runAt: runAt.toISOString(),
    });
  });
});
