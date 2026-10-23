import { describe, expect, it } from 'vitest';
import {
  type OutboundTarget,
  outboundCopyEvidenceKey,
  outboundCopyRevision,
  outboundTargetEvidenceKey,
  outboundTargetRevision,
} from './approval';
import {
  buildOutboundRow,
  cleanOutboundName,
  countOutboundViews,
  fitBand,
  fitBasis,
  type OutboundLeadFacts,
  rankOutboundRows,
  whyNow,
} from './queue';

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

function row(lead: OutboundLeadFacts, ledger = []) {
  return buildOutboundRow({
    facts: lead,
    target: target(lead),
    dedupeKey: `email:${lead.contactEmail}`,
    ledger,
    now: NOW,
  });
}

describe('outbound queue display', () => {
  it('strips Linktree page-title noise from names', () => {
    expect(cleanOutboundName('Ada - Listen on Spotify', 'ada')).toBe('Ada');
    expect(
      cleanOutboundName('Mega Ran | Instagram, Facebook, Twitch', 'megaran')
    ).toBe('Mega Ran');
    expect(
      cleanOutboundName('Tom River | Official Music, Tour Dates & Tickets', 't')
    ).toBe('Tom River');
    expect(cleanOutboundName('@bktherula', 'bk')).toBe('bktherula');
    expect(cleanOutboundName(null, 'handle')).toBe('handle');
  });

  it('trims whitespace before removing handle prefixes', () => {
    expect(cleanOutboundName('  @bktherula  ', 'bk')).toBe('bktherula');
    expect(cleanOutboundName('  @  ', 'handle')).toBe('handle');
  });

  it('bands fit scores and keeps unscored leads unknown', () => {
    expect(fitBand(null)).toBe('unknown');
    expect(fitBand(80)).toBe('high');
    expect(fitBand(45)).toBe('medium');
    expect(fitBand(10)).toBe('low');
  });

  it('only reports dated trigger events as why-now (A16)', () => {
    expect(
      whyNow(
        facts({ latestReleaseDate: new Date('2026-09-30T00:00:00Z') }),
        NOW
      )
    ).toBe('Released 5 days ago');
    expect(
      whyNow(facts({ paidAt: new Date('2026-10-03T12:00:00Z') }), NOW)
    ).toBe('Paid yesterday');
    // Static attributes are not triggers.
    expect(whyNow(facts({ spotifyFollowers: 908 }), NOW)).toBeNull();
    expect(whyNow(facts(), NOW)).toBeNull();
    expect(
      whyNow(
        facts({ ingestedAt: null, discoveryQuery: 'site:linktr.ee dj' }),
        NOW
      )
    ).toBeNull();
    // An old release or a future date is not "now".
    expect(
      whyNow(
        facts({ latestReleaseDate: new Date('2026-01-01T00:00:00Z') }),
        NOW
      )
    ).toBeNull();
    expect(
      whyNow(
        facts({ latestReleaseDate: new Date('2026-12-01T00:00:00Z') }),
        NOW
      )
    ).toBeNull();
  });

  it('labels presence-only and missing fit scores instead of banding them (A15)', () => {
    const presence = {
      hasSpotify: 15,
      usesLinkInBio: 15,
      usesMusicTools: 10,
      hasContactEmail: 5,
      genreMatch: 0,
      meta: { version: 5 },
    };
    expect(fitBasis(45, presence)).toBe('presence_only');
    expect(fitBasis(45, { ...presence, genreMatch: 10 })).toBe('scored');
    expect(fitBasis(null, null)).toBe('unscored');
    const thin = row(facts({ fitScoreBreakdown: presence }));
    expect(thin).toMatchObject({
      fit: 'unknown',
      fitBasis: 'presence_only',
      view: 'ready',
    });
    expect(thin.flags).toContain('presence_only_fit');
    const unscored = row(facts({ fitScore: null }));
    expect(unscored).toMatchObject({ view: 'flagged', fitBasis: 'unscored' });
  });

  it('keeps rows with missing evidence out of Ready to certify (A12)', () => {
    const built = row(facts({ evidenceClasses: ['dsp'] }));
    expect(built.view).toBe('needs_evidence');
    expect(built.nextAction).toBe('gather_evidence');
    expect(built.missingEvidence).toEqual([
      'catalog',
      'search',
      'reachability',
    ]);
    const noProfile = row(
      facts({ creatorProfileId: null, evidenceClasses: null })
    );
    expect(noProfile).toMatchObject({
      view: 'needs_evidence',
      nextAction: 'build_profile',
    });
  });

  it('flags possible non-artists without rejecting them (A13)', () => {
    const curator = row(
      facts({
        linktreeHandle: 'spotifyplaylistcurator',
        displayName: 'Best Spotify Playlist Pitch',
      })
    );
    expect(curator).toMatchObject({
      view: 'flagged',
      nextAction: 'check_entity',
    });
    expect(curator.flags).toContain('possible_non_artist');
    expect(curator.entityNote).toMatch(/curator/);
    expect(curator.approval.target).toBe('unreviewed');
  });

  it('drafts only on a channel with a recipient on file (A17)', () => {
    const noEmail = row(facts({ contactEmail: null, outreachRoute: 'email' }));
    expect(noEmail.channel).toBeNull();
    expect(noEmail.message).toBeNull();
    const dmOnly = row(
      facts({
        contactEmail: null,
        outreachRoute: 'both',
        instagramHandle: 'ada',
      })
    );
    expect(dmOnly.channel).toBe('dm');
    const flagOnly = row(
      facts({ contactEmail: null, hasInstagram: true, instagramHandle: null })
    );
    expect(flagOnly.channel).toBeNull();
  });

  it('defaults to Ready to certify with a creator-generic draft', () => {
    const built = row(facts());
    expect(built.view).toBe('ready');
    expect(built.nextAction).toBe('review_facts');
    expect(built.name).toBe('Ada');
    expect(built.ability).toBe('unknown');
    expect(built.intent).toBe('unknown');
    expect(built.message?.channel).toBe('email');
    expect(built.message?.revision).toBeNull();
    expect(built.message?.body).toContain('https://jov.ie/claim/tok');
    expect(built.message?.body.startsWith('Hey Ada,')).toBe(true);
  });

  it('asks for a profile build before facts exist', () => {
    const built = row(
      facts({
        creatorProfileId: null,
        status: 'qualified',
        evidenceClasses: null,
      })
    );
    expect(built.nextAction).toBe('build_profile');
  });

  it('moves certified, approved, sent, claimed and paid people to their views', () => {
    expect(row(facts({ certified: true })).view).toBe('certified');
    expect(row(facts({ outreachStatus: 'dm_sent' })).view).toBe('sent');
    expect(row(facts({ replied: true })).view).toBe('replied');
    expect(row(facts({ signupUserId: 'user-1' })).view).toBe('claimed');
    expect(row(facts({ paidAt: NOW })).view).toBe('paid');

    const lead = facts({ certified: true });
    const t = target(lead);
    const targetRevision = outboundTargetRevision(t);
    const draft = row(lead).message;
    if (!draft) throw new Error('expected a draft');
    const copy = {
      channel: draft.channel,
      subject: draft.subject,
      body: draft.body,
    };
    const approved = row(lead, [
      {
        evidenceKey: outboundTargetEvidenceKey(lead.id),
        evidenceRevision: targetRevision,
        decision: 'yes',
        snapshot: {},
        actorUserId: 'tim',
        createdAt: '2026-10-04T10:00:00Z',
      },
      {
        evidenceKey: outboundCopyEvidenceKey(lead.id),
        evidenceRevision: outboundCopyRevision(targetRevision, copy),
        decision: 'yes',
        snapshot: { targetRevision, ...copy },
        actorUserId: 'tim',
        createdAt: '2026-10-04T10:01:00Z',
      },
    ] as never);
    expect(approved.view).toBe('approved');
    expect(approved.nextAction).toBe('send');
  });

  it('ranks closest-to-revenue first, then fit, then priority', () => {
    const ranked = rankOutboundRows(
      [
        row(
          facts({
            id: 'a',
            fitScore: 90,
            creatorProfileId: null,
            evidenceClasses: null,
          })
        ),
        row(facts({ id: 'b', fitScore: 40 })),
        row(facts({ id: 'c', fitScore: 70 })),
        row(facts({ id: 'd', fitScore: 70, certified: true })),
      ],
      new Map([['c', 5]])
    );
    expect(ranked.map(item => [item.leadId, item.rank])).toEqual([
      ['d', 1],
      ['c', 2],
      ['b', 3],
      ['a', 4],
    ]);
    expect(countOutboundViews(ranked)).toMatchObject({
      ready: 2,
      needs_evidence: 1,
      certified: 1,
      approved: 0,
    });
  });
});
