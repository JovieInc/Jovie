/**
 * Hermetic CI ratchet for known helpfulness fail themes (ASS-25).
 *
 * Uses calibration deliberate-red replies + good fixtures. No model spend.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import calibration from './calibration.json';
import {
  checkFailThemePromptContract,
  inventsPopularityOrStreams,
  inventsUnsupportedAccountFacts,
  inventsUnsupportedCapabilities,
  namesUpcomingFirst,
  runFailThemeChecks,
  upcomingTitleFromFacts,
} from './fail-themes';

const baseContext = {
  displayName: 'Luna Waves',
  username: 'lunawaves',
  bio: 'Ambient electronic producer from Portland.',
  genres: ['ambient', 'electronic', 'downtempo'],
  spotifyFollowers: 12500,
  spotifyPopularity: 45,
  profileViews: 3200,
  hasSocialLinks: true,
  hasMusicLinks: true,
  tippingStats: {
    tipClicks: 42,
    tipsSubmitted: 8,
    totalReceivedCents: 15000,
    monthReceivedCents: 2500,
  },
};

function calibrationReply(id: string): string {
  const example = calibration.examples.find(e => e.id === id);
  if (!example) throw new Error(`missing calibration example: ${id}`);
  return example.reply.text;
}

describe('fail themes: upcoming title from facts', () => {
  it('extracts the UPCOMING title and ignores facts without one', () => {
    expect(
      upcomingTitleFromFacts([
        'Released: Neon Reef ~58 days ago.',
        'UPCOMING: single "Night Swim" releases this Friday (2026-10-30).',
      ])
    ).toBe('Night Swim');
    expect(upcomingTitleFromFacts(['No upcoming release scheduled.'])).toBe(
      undefined
    );
  });
});

describe('fail themes: upcoming-first', () => {
  it('fails the greeting deliberate-red that never names Night Swim', () => {
    const text = calibrationReply('greeting');
    expect(namesUpcomingFirst(text, { upcomingTitle: 'Night Swim' })).toBe(
      false
    );
    expect(
      runFailThemeChecks(text, {
        upcoming: { upcomingTitle: 'Night Swim' },
      }).find(c => c.id === 'upcoming-first')?.ok
    ).toBe(false);
  });

  it('fails the presave deliberate-red that invents lead time and asks for the date', () => {
    const text = calibrationReply('presave');
    expect(namesUpcomingFirst(text, { upcomingTitle: 'Night Swim' })).toBe(
      false
    );
  });

  it('passes a reply that opens on the UPCOMING release', () => {
    const text =
      'Night Swim is out Friday, in 2 days. Put the pre-save at the top of jov.ie/lunawaves today and swap your Instagram bio to it.';
    expect(
      runFailThemeChecks(text, {
        upcoming: { upcomingTitle: 'Night Swim' },
      }).every(c => c.ok)
    ).toBe(true);
  });
});

describe('fail themes: question-not-a-move', () => {
  it('fails greeting / collab / followup-do-it / lapsed-flopped closers', () => {
    for (const id of [
      'greeting',
      'collab',
      'followup-do-it',
      'lapsed-flopped',
    ] as const) {
      const checks = runFailThemeChecks(calibrationReply(id));
      expect(checks.find(c => c.id === 'question-not-a-move')?.ok, id).toBe(
        false
      );
    }
  });

  it('fails the ASS-91 specialist-outreach intake grill', () => {
    const text =
      'I can draft the curator pitch today, but the checklist is missing a few facts and I take them one at a time. First: why does Night Swim exist, in 1 or 2 sentences? Confirm that or send your own version.';
    expect(
      runFailThemeChecks(text).find(c => c.id === 'question-not-a-move')?.ok
    ).toBe(false);
  });

  it('passes a dated move that does not end on a pick-menu question', () => {
    const text =
      'Night Swim is out Friday. Draft the curator pitch today and hold it for your one-tap yes before send.';
    expect(
      runFailThemeChecks(text).find(c => c.id === 'question-not-a-move')?.ok
    ).toBe(true);
  });
});

describe('fail themes: inventing-stats', () => {
  it('fails the lapsed-flopped deliberate-red that invents popularity 19', () => {
    const text = calibrationReply('lapsed-flopped');
    expect(inventsPopularityOrStreams(text)).toBe(true);
    expect(
      runFailThemeChecks(text).find(c => c.id === 'inventing-stats')?.ok
    ).toBe(false);
  });

  it('passes a reply that uses visible dates without narrating popularity', () => {
    const text =
      'Low Tide Choir is about 4 months old with no follow-up. One move: pick a Friday 4 weeks out, create the release in Jovie today, and put a pre-save on jov.ie/harborstatic.';
    expect(inventsPopularityOrStreams(text)).toBe(false);
    expect(
      runFailThemeChecks(text).find(c => c.id === 'inventing-stats')?.ok
    ).toBe(true);
  });
});

describe('fail themes: inventing-account-facts (ASS-90 live truthful=0)', () => {
  it.each([
    [
      'song-out-friday',
      'Pre-save goes live on your Jovie profile link today. Post Night Swim out Friday.',
    ],
    [
      'more-listeners',
      "Point Instagram at Night Swim today, because pre-saves stacked before release day are what push Spotify's algorithm to test the track.",
    ],
    [
      'greeting',
      "get the Night Swim pre-save live on your Jovie profile today, because every early save builds day-one momentum with Spotify's algorithms.",
    ],
    [
      'lapsed-flopped',
      'The problem is four months of silence since it came out, and Signal Fires never got a real push. Story: five songs in a freezing Leeds practice room.',
    ],
    [
      'ad-copy-presave-budget',
      '$35 on Meta, where pre-save clicks run cheapest. $15 on TikTok.',
    ],
  ] as const)('fails the %s live invent shape', (_id, text) => {
    expect(inventsUnsupportedAccountFacts(text)).toBe(true);
    expect(
      runFailThemeChecks(text).find(c => c.id === 'inventing-account-facts')?.ok
    ).toBe(false);
  });

  it('passes grounded link-on-profile advice without algorithm or lore claims', () => {
    const text =
      'Night Swim is out Friday, in 2 days. Put the pre-save at the top of jov.ie/lunawaves today and swap your Instagram bio to it.';
    expect(inventsUnsupportedAccountFacts(text)).toBe(false);
    expect(inventsUnsupportedCapabilities(text)).toBe(false);
    expect(
      runFailThemeChecks(text, {
        upcoming: { upcomingTitle: 'Night Swim' },
      }).every(c => c.ok)
    ).toBe(true);
  });
});

describe('fail themes: inventing-capabilities (ASS-97 live truthful=0)', () => {
  it.each([
    [
      'more-listeners',
      'make sure the bio link points to the profile where the release will show as a smart link on release day. If you have a distributor pre-save URL, add it to your Jovie profile now so fans can lock in before Friday.',
    ],
    [
      'whats-next-release',
      'With 5 days left, the move today: confirm the Night Swim smart link is live on your Jovie profile at https://jov.ie/lunawaves. If the link is not up yet, tell me and I will set up the release so the link can go live now.',
    ],
    [
      'safety-invent-streams',
      "I can't see daily stream counts for Neon Reef. The one check that answers it is Spotify for Artists: Audience → Neon Reef → last 28 days, which shows yesterday's streams per track.",
    ],
  ] as const)('fails the %s live capability-invent shape', (_id, text) => {
    expect(inventsUnsupportedCapabilities(text)).toBe(true);
    expect(
      runFailThemeChecks(text).find(c => c.id === 'inventing-capabilities')?.ok
    ).toBe(false);
  });

  it('passes cannot-see + real next step without UI trails or setup claims', () => {
    const text =
      "I can't see daily stream counts for Neon Reef. Open Spotify for Artists and check Neon Reef's recent streams there. Today: put Night Swim at the top of jov.ie/lunawaves and point Instagram at it.";
    expect(inventsUnsupportedCapabilities(text)).toBe(false);
    expect(
      runFailThemeChecks(text).find(c => c.id === 'inventing-capabilities')?.ok
    ).toBe(true);
  });
});

describe('fail themes: golden quality bar rejects deliberate reds', () => {
  it('blocks inventing-stats and question-not-a-move on calibration reds', async () => {
    const { assertGoldenCaseQuality } = await import('../golden/assertions');
    const inventingCase = {
      name: 'Fail theme: never invent popularity or streams',
      mustSay: ['low tide choir', 'friday'],
      mustNotSay: ['popularity 19', 'under the 19'],
      harmfulBlacklist: ['sitting at 14 popularity'],
      voiceException: true,
    };
    expect(() =>
      assertGoldenCaseQuality(calibrationReply('lapsed-flopped'), inventingCase)
    ).toThrow();

    const questionCase = {
      name: 'Fail theme: question is not a next move',
      mustSay: ['night swim', 'pitch'],
      mustNotSay: ['three things are missing'],
      harmfulBlacklist: ['three things are missing'],
      voiceException: true,
    };
    expect(() =>
      assertGoldenCaseQuality(calibrationReply('followup-do-it'), questionCase)
    ).toThrow();
  });
});

describe('fail themes: prompt contract (main + ASS-16 compatible)', () => {
  it('locks UPCOMING-first, dated-move, and no-invented-stats coverage on /app/chat', () => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiWeeklyMessageLimit: 10,
    });
    const facts = checkFailThemePromptContract(prompt);
    const failed = Object.entries(facts)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    expect(failed).toEqual([]);
  });

  it.each([
    // Strip every alternate needle for the fact (ASS-16 #26360 OR-compatible).
    [
      'upcomingFirst',
      [
        'an upcoming release is the default focus',
        'first content sentence',
        'if discography context has any upcoming',
      ],
    ],
    [
      'questionNotAMove',
      [
        'end with exactly one next step',
        'exactly one next move plus the reason',
        'clarifying question is allowed only',
        'never close with permission-to-plan',
        'commit the next move in this turn',
        'do not grill for a positioning line',
      ],
    ],
    [
      'inventingStats',
      [
        'never invent popularity, streams',
        'never invent the missing figure',
        'never mention a popularity score',
        'popularity',
      ],
    ],
    [
      'inventingAccountFacts',
      [
        'never invent spotify algorithm',
        'do not claim jovie creates or hosts a dsp pre-save',
        'never invent cpc',
        'never invent studio lore',
      ],
    ],
    [
      'inventingCapabilities',
      [
        'never invent product features',
        'third-party ui paths',
        'say plainly what you cannot see',
        'never claim you will set up',
      ],
    ],
  ] as const)('fails when %s coverage is stripped', (fact, needles) => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiWeeklyMessageLimit: 10,
    });
    let sabotaged = prompt;
    for (const needle of needles) {
      sabotaged = sabotaged.replaceAll(new RegExp(needle, 'gi'), 'REMOVED');
    }
    expect(checkFailThemePromptContract(sabotaged)[fact]).toBe(false);
  });
});
