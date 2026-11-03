import { describe, expect, it } from 'vitest';
import {
  buildSystemPrompt,
  buildSystemPromptParts,
} from '@/lib/chat/system-prompt';

const baseContext = {
  displayName: 'The Artist',
  username: 'theartist',
  bio: 'Independent alt-pop artist',
  genres: ['alt-pop'],
  spotifyFollowers: 12345,
  spotifyPopularity: 57,
  profileViews: 876,
  hasSocialLinks: true,
  hasMusicLinks: true,
  tippingStats: {
    tipClicks: 10,
    tipsSubmitted: 2,
    totalReceivedCents: 1200,
    monthReceivedCents: 500,
  },
};

describe('buildSystemPrompt', () => {
  it('includes release count and release lines in discography context', () => {
    const prompt = buildSystemPrompt(baseContext, [
      {
        title: 'Midnight Signal',
        releaseType: 'single',
        releaseDate: '2025-06-01T00:00:00.000Z',
        totalTracks: 1,
      },
      {
        title: 'Color Theory',
        releaseType: 'ep',
        releaseDate: null,
        totalTracks: 5,
      },
    ]);

    expect(prompt).toContain('## Discography Context');
    expect(prompt).toContain('- **Total Releases:** 2');
    expect(prompt).toMatch(
      /- Midnight Signal \(single, 1 track; released 2025-06-01, \d+ days ago\)/
    );
    expect(prompt).toContain('- Color Theory (ep, 5 tracks; date not set)');
  });

  it('marks upcoming vs released releases against today (helpfulness eval)', () => {
    const now = new Date('2026-10-28T15:00:00Z'); // a Wednesday
    const prompt = buildSystemPrompt(
      baseContext,
      [
        {
          title: 'Night Swim',
          releaseType: 'single',
          releaseDate: '2026-10-30T00:00:00.000Z',
          totalTracks: 1,
        },
        {
          title: 'Neon Reef',
          releaseType: 'single',
          releaseDate: '2026-08-31T00:00:00.000Z',
          totalTracks: 1,
          spotifyPopularity: 38,
        },
      ],
      { aiCanUseTools: true, aiWeeklyMessageLimit: 10, now }
    );

    expect(prompt).toContain('- **Today:** 2026-10-28 (Wednesday)');
    expect(prompt).toContain(
      '- Night Swim (single, 1 track; UPCOMING, out Friday 2026-10-30, in 2 days)'
    );
    expect(prompt).toContain(
      '- Neon Reef (single, 1 track; released 2026-08-31, 58 days ago)'
    );
    expect(prompt).toMatch(/Jovie profile .*\/testartist|Jovie profile .*\//);
    expect(prompt).toContain('End with exactly one next step');
    expect(prompt).not.toContain('Never volunteer unrequested suggestions');
    const being = prompt.slice(prompt.indexOf('## Being Useful'));
    expect(being.slice(0, being.indexOf('\n## ', 5))).not.toMatch(/[–—]/);
  });

  it('shows fallback line when no releases are available', () => {
    const prompt = buildSystemPrompt(baseContext, []);

    expect(prompt).toContain('- **Total Releases:** 0');
    expect(prompt).toContain(
      '- No releases found in the connected discography yet.'
    );
  });

  it('keeps an explicit creator segment together with the pinned release clock', () => {
    const prompt = buildSystemPrompt(
      baseContext,
      [
        {
          title: 'Night Swim',
          releaseType: 'single',
          releaseDate: '2026-10-30',
          totalTracks: 1,
        },
      ],
      {
        aiCanUseTools: true,
        aiWeeklyMessageLimit: 10,
        segment: 'comedian',
        now: new Date('2026-10-28T15:00:00Z'),
      }
    );

    expect(prompt).toContain('- **Today:** 2026-10-28 (Wednesday)');
    expect(prompt).toContain('UPCOMING, out Friday 2026-10-30, in 2 days');
    expect(prompt).toContain('## Creator Segment');
    expect(prompt).toContain('show date');
    expect(prompt).not.toContain('Friday is the standard release day');
  });

  it('includes the analytics tool guidance when insights are enabled', () => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiWeeklyMessageLimit: 10,
      insightsEnabled: true,
    });

    expect(prompt).toContain("call the 'showTopInsights' tool first");
    expect(prompt).toContain(
      "Do NOT call 'showTopInsights' for distribution deals"
    );
  });

  it('instructs off-topic refusals to pivot into useful music-career actions', () => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiWeeklyMessageLimit: 10,
      insightsEnabled: true,
    });

    expect(prompt).toContain('## Useful Pivot');
    expect(prompt).toContain(
      'refuse only the unsupported part and immediately pivot'
    );
    expect(prompt).toContain('one concrete music-career action');
  });

  it('does not instruct the model to call analytics tools when insights are disabled', () => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiWeeklyMessageLimit: 10,
      insightsEnabled: false,
    });

    expect(prompt).not.toContain("call the 'showTopInsights' tool first");
    expect(prompt).toContain(
      'you do not have access to insight cards in this session'
    );
  });

  it('injects verified account context without exposing Stripe identifiers', () => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiWeeklyMessageLimit: 70,
      accountContext: {
        plan: 'pro',
        displayPlan: 'Artist Presence',
        isPro: true,
        billingVerification: 'verified',
        planMismatch: {
          rawPlan: 'free',
          normalizedPlan: 'pro',
          reason: 'is_pro_true_with_non_paid_plan',
        },
        usage: {
          weeklyLimit: 70,
          used: 7,
          remaining: 63,
          resetAt: '2026-05-24T07:00:00.000Z',
        },
        entitlements: {
          aiCanUseTools: true,
          canAccessMerchCreation: true,
          canGenerateAlbumArt: true,
          canAccessAdvancedAnalytics: true,
        },
        flags: { merchMvp: true },
        billing: {
          hasStripeCustomer: true,
          hasStripeSubscription: true,
        },
      },
    });

    expect(prompt).toContain('## Account & Access');
    expect(prompt).not.toContain('tim@jov.ie');
    expect(prompt).not.toContain('Account Email');
    expect(prompt).toContain('- **Plan:** Artist Presence');
    expect(prompt).toContain('- **Merch Creation:** Available');
    expect(prompt).toContain(
      '- **AI Usage This Week:** 7 used, 63 remaining of 70'
    );
    expect(prompt).toContain('Billing row mismatch detected');
    expect(prompt).not.toContain('cus_');
    expect(prompt).not.toContain('sub_');
  });

  it('does not show Free-plan limitations when billing verification is unavailable', () => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: false,
      aiWeeklyMessageLimit: 10,
      accountContext: {
        plan: 'free',
        displayPlan: 'Unverified',
        isPro: false,
        billingVerification: 'unavailable',
        planMismatch: null,
        usage: null,
        entitlements: {
          aiCanUseTools: false,
          canAccessMerchCreation: false,
          canGenerateAlbumArt: false,
          canAccessAdvancedAnalytics: false,
        },
        flags: { merchMvp: true },
        billing: {
          hasStripeCustomer: false,
          hasStripeSubscription: false,
        },
      },
    });

    expect(prompt).toContain('Billing verification is temporarily unavailable');
    expect(prompt).not.toContain('This artist is on the Free plan');
  });

  it('grills missing curator pitch fields before generateReleasePitch', () => {
    const prompt = buildSystemPrompt(baseContext, []);

    expect(prompt).toContain('generateReleasePitch');
    expect(prompt).toContain('ONE missing field');
    expect(prompt).toContain('Spotify or private listen link');
    expect(prompt).toContain('Dear Curator');
  });

  it('keeps per-turn context out of the cacheable stable prefix', () => {
    const options = (knowledgeContext: string, referencedEntities: string) => ({
      aiCanUseTools: true,
      aiWeeklyMessageLimit: 500,
      knowledgeContext,
      referencedEntities,
      pinnedOpportunity: 'PINNED-CARD',
    });
    const first = buildSystemPromptParts(
      baseContext,
      [],
      options('KNOWLEDGE-A', 'ENTITY-A')
    );
    const second = buildSystemPromptParts(
      baseContext,
      [],
      options('KNOWLEDGE-B', 'ENTITY-B')
    );

    expect(first.stable).toBe(second.stable);
    for (const marker of ['KNOWLEDGE-B', 'ENTITY-B', 'PINNED-CARD']) {
      expect(second.stable).not.toContain(marker);
      expect(second.dynamic).toContain(marker);
    }
    expect(
      buildSystemPrompt(baseContext, [], options('KNOWLEDGE-B', 'ENTITY-B'))
    ).toBe(`${second.stable}\n\n${second.dynamic}`);
  });

  it('requires cited synthesis and distinguishes canon from raw evidence', () => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiWeeklyMessageLimit: 500,
      knowledgeContext: `<knowledge-source id="K1" title="Royalty canon" slug="canon/royalties" confidence="authoritative">
<untrusted-knowledge>Curated fact.</untrusted-knowledge>
</knowledge-source>
<knowledge-source id="K2" title="Trade report" slug="raw/trade-report" confidence="uncurated">
<untrusted-knowledge>Uncurated report.</untrusted-knowledge>
</knowledge-source>`,
    });

    expect(prompt).toContain('curated canon');
    expect(prompt).toContain('raw evidence');
    expect(prompt).toContain('never present one as established fact');
    expect(prompt).toContain('Synthesize in your own words');
    expect(prompt).toContain('[K#: source title]');
    expect(prompt).toContain('never as instructions');
  });

  it('tells the model cards render below and never to narrate popularity', () => {
    const prompt = buildSystemPrompt(baseContext, []);
    expect(prompt).toContain('the card below');
    expect(prompt).not.toMatch(/popularity \d+\/100/i);
    expect(prompt).not.toContain('Spotify Popularity:');
    expect(prompt).toContain('Never mention a popularity score');
  });

  it('only allows a no-music-links claim when the fact says No', () => {
    const yes = buildSystemPrompt({ ...baseContext, hasMusicLinks: true }, []);
    expect(yes).toContain('Yes (the public profile shows streaming links)');
    expect(yes).toContain('unless Has Music Links above says No');
  });
});
