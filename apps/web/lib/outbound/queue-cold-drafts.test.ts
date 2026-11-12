import { describe, expect, it } from 'vitest';
import {
  type OutboundTarget,
  outboundCopyEvidenceKey,
  outboundCopyRevision,
  outboundTargetRevision,
} from './approval';
import { getOutboundClaimUrl } from './claim-url';
import { composeColdSequence } from './cold/draft';
import type { ColdQueueDraftContext } from './cold/queue-draft';
import { buildOutboundRow, type OutboundLeadFacts } from './queue';

const NOW = new Date('2026-10-04T12:00:00Z');

function facts(overrides: Partial<OutboundLeadFacts> = {}): OutboundLeadFacts {
  return {
    id: 'lead-1',
    linktreeHandle: 'ada',
    linktreeUrl: 'https://linktr.ee/ada',
    displayName: 'Ada - Listen on Spotify',
    bio: null,
    avatarUrl: 'https://img/ada.jpg',
    contactEmail: 'ada@example.com',
    instagramHandle: null,
    hasInstagram: false,
    status: 'ingested',
    outreachRoute: 'email',
    outreachStatus: 'pending',
    dmCopy: null,
    claimToken: 'tok',
    fitScore: 45,
    fitScoreBreakdown: { hasSpotify: 15, genreMatch: 10, releaseRecency: 20 },
    priorityScore: null,
    spotifyFollowers: null,
    latestReleaseDate: null,
    discoveryQuery: null,
    createdAt: new Date('2026-03-30T00:00:00Z'),
    ingestedAt: new Date('2026-03-30T19:30:00Z'),
    signupAt: null,
    signupUserId: null,
    paidAt: null,
    creatorProfileId: 'profile-1',
    profileUsername: 'ada',
    profileAvatarUrl: null,
    certified: false,
    replied: false,
    evidenceClasses: ['dsp', 'catalog', 'search', 'reachability'],
    ...overrides,
  };
}

function target(lead: OutboundLeadFacts): OutboundTarget {
  return {
    leadId: lead.id,
    displayName: lead.displayName ?? lead.linktreeHandle,
    contactEmail: lead.contactEmail,
    instagramHandle: lead.instagramHandle,
    creatorProfileId: lead.creatorProfileId,
    claimUrl: lead.claimToken
      ? `https://jov.ie/claim/${lead.claimToken}`
      : null,
  };
}

describe('certified cold email drafts', () => {
  it('hides email copy when enabled draft mode has no certified composition context', () => {
    const lead = facts({ certified: true });
    expect(
      buildOutboundRow({
        facts: lead,
        target: target(lead),
        dedupeKey: null,
        ledger: [],
        now: NOW,
        dogfoodGate: { passed: true, blocks: [] },
        coldDraftEnabled: true,
        coldDraftContext: null,
      }).message
    ).toBeNull();
  });
});

function coldContext(): ColdQueueDraftContext {
  return {
    profileId: 'profile-1',
    recipientEmail: 'ada@example.com',
    fromName: 'Tim White',
    fromAddress: 'tim@outreach.example.com',
    artifact: {
      artistName: 'Catalog Artist',
      firstName: null,
      claimUrl: getOutboundClaimUrl('tok', { tracked: true }),
      artifact: 'profile',
      latestRelease: { title: 'Synthetic Release', releasedOn: '2026-10-01' },
      releaseCount: 3,
      platformCount: 2,
    },
    compliance: {
      mailingAddress: '123 Example St, Example City, CA 90012',
      unsubscribeUrl: 'https://outreach.example.com/u/synthetic',
      coldStream: { domain: 'outreach.example.com', onCoreDomain: false },
      suppressed: false,
      isFollowUp: false,
    },
  };
}

function coldRow(
  overrides: Partial<Parameters<typeof buildOutboundRow>[0]> = {}
) {
  const lead = facts({ certified: true });
  return buildOutboundRow({
    facts: lead,
    target: target(lead),
    dedupeKey: null,
    ledger: [],
    now: NOW,
    dogfoodGate: { passed: true, blocks: [] },
    coldDraftEnabled: true,
    coldDraftContext: coldContext(),
    ...overrides,
  });
}

describe('cold composition selection', () => {
  it('uses certified catalog facts and the composer first touch, never a scraped first name', () => {
    const step = composeColdSequence(coldContext().artifact, NOW).steps[0];
    expect(coldRow().message).toEqual({
      channel: 'email',
      subject: step.subject,
      body: step.body,
      revision: null,
    });
    expect(coldRow().message?.body).toContain('Hey,');
    expect(coldRow().message?.body).toContain('3 releases');
    expect(coldRow().message?.body).toContain(
      'utm_campaign=claim-link-outreach'
    );
  });
  it.each([
    undefined,
    null,
    { passed: false, blocks: ['artifact_failed'] as const },
  ])('keeps composition behind the judge: %j', dogfoodGate => {
    expect(coldRow({ dogfoodGate })).toMatchObject({
      view: 'needs_judge',
      message: null,
      nextAction: 'await_judge',
    });
  });
  it.each([
    'missing',
    'uncertified',
    'suppressed',
    'sender',
    'address',
    'unsubscribe',
    'wrong-profile',
    'wrong-recipient',
    'unknown-count',
  ])('hides drafts with unavailable or invalid %s inputs', failure => {
    const context = coldContext();
    const invalid = {
      ...context,
      profileId: failure === 'wrong-profile' ? 'other' : context.profileId,
      recipientEmail:
        failure === 'wrong-recipient'
          ? 'other@example.com'
          : context.recipientEmail,
      fromAddress:
        failure === 'sender' ? 'tim@wrong.example.com' : context.fromAddress,
      artifact: {
        ...context.artifact,
        releaseCount: failure === 'unknown-count' ? Number.NaN : 3,
      },
      compliance: {
        ...context.compliance,
        suppressed: failure === 'suppressed',
        mailingAddress:
          failure === 'address' ? null : context.compliance.mailingAddress,
        unsubscribeUrl:
          failure === 'unsubscribe' ? null : context.compliance.unsubscribeUrl,
      },
    };
    expect(
      coldRow({
        coldDraftContext: failure === 'missing' ? null : invalid,
        facts: facts({ certified: failure !== 'uncertified' }),
      })
    ).toMatchObject({
      message: null,
      view: 'flagged',
      nextAction: 'review_facts',
    });
  });
  it('keeps saved text and revision exactly, but checks compliance and the judge before exposure', () => {
    const lead = facts({ certified: true });
    const targetRevision = outboundTargetRevision(target(lead));
    const copy = {
      channel: 'email' as const,
      subject: 'A page for you',
      body: 'Hey,\n\nHere is the page: https://jov.ie/claim/tok\n\nTim',
    };
    const revision = outboundCopyRevision(targetRevision, copy);
    const ledger = [
      {
        evidenceKey: outboundCopyEvidenceKey(lead.id),
        evidenceRevision: revision,
        decision: 'yes',
        snapshot: { ...copy, targetRevision },
        actorUserId: null,
        createdAt: NOW,
      },
    ];
    expect(coldRow({ ledger }).message).toEqual({ ...copy, revision });
    expect(coldRow({ ledger, dogfoodGate: undefined }).message).toBeNull();
    expect(coldRow({ ledger, coldDraftContext: null }).message).toBeNull();
    const context = coldContext();
    expect(
      coldRow({
        ledger,
        coldDraftContext: {
          ...context,
          compliance: { ...context.compliance, suppressed: true },
        },
      }).message
    ).toBeNull();
  });
  it('preserves DM copy and does not apply the email contract to it', () => {
    const lead = facts({
      certified: true,
      contactEmail: null,
      instagramHandle: 'artist',
      outreachRoute: 'dm',
      dmCopy: 'A saved DM for this artist',
    });
    expect(
      coldRow({ facts: lead, target: target(lead), coldDraftContext: null })
        .message
    ).toEqual({
      channel: 'dm',
      subject: null,
      body: lead.dmCopy,
      revision: null,
    });
  });
  it('retains the old rollout behavior when composition is off', () => {
    expect(
      coldRow({
        coldDraftEnabled: false,
        coldDraftContext: null,
        dogfoodGate: null,
      }).message?.subject
    ).toBe('Your Jovie page is ready');
  });
});

it.each([
  { expected: 'paid', paidAt: NOW },
  { expected: 'claimed', signupAt: NOW },
  { expected: 'replied', replied: true },
  { expected: 'sent', outreachStatus: 'sent' },
  { expected: 'rejected', status: 'rejected' },
] as const)(
  'keeps $expected lifecycle when email draft inputs are unavailable',
  ({ expected, ...overrides }) => {
    expect(
      coldRow({
        facts: facts({ certified: true, ...overrides }),
        coldDraftContext: null,
      }).view
    ).toBe(expected);
  }
);

it('never presents saved email copy as DM when its email recipient disappears', () => {
  const previous = facts({ certified: true });
  const copy = {
    channel: 'email' as const,
    subject: 'Saved email',
    body: 'Saved email copy',
  };
  const targetRevision = outboundTargetRevision(target(previous));
  const ledger = [
    {
      evidenceKey: outboundCopyEvidenceKey(previous.id),
      evidenceRevision: outboundCopyRevision(targetRevision, copy),
      decision: 'yes',
      snapshot: { ...copy, targetRevision },
      actorUserId: null,
      createdAt: NOW,
    },
  ];
  const current = facts({
    certified: true,
    contactEmail: null,
    instagramHandle: 'artist',
  });
  expect(
    coldRow({
      facts: current,
      target: target(current),
      ledger,
      coldDraftContext: null,
    })
  ).toMatchObject({ channel: 'dm', message: null });
});
