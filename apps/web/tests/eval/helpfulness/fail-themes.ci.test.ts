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
    ['upcomingFirst', 'UPCOMING'],
    ['questionNotAMove', 'do it'],
    ['inventingStats', 'popularity'],
  ] as const)('fails when %s coverage is stripped (%s)', (fact, needle) => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiWeeklyMessageLimit: 10,
    });
    // Remove every occurrence so weaker/stronger wording both disappear.
    const sabotaged = prompt.replaceAll(new RegExp(needle, 'gi'), 'REMOVED');
    expect(checkFailThemePromptContract(sabotaged)[fact]).toBe(false);
  });
});
