/**
 * Cross-segment eval fixtures (JOV-9679). For each segment, everything the
 * product would select (agent prompt context, recommendations, notifications,
 * onboarding lines) must carry no other segment's vocabulary.
 */
import { describe, expect, it } from 'vitest';
import { SCRIPT_LINES } from '@/lib/chat/onboarding-script/script';
import { buildSystemPromptParts } from '@/lib/chat/system-prompt';
import {
  AGENT_PLAYBOOKS,
  buildSegmentPromptSection,
  crossSegmentTerms,
  FEATURES,
  INSIGHT_ACTIONS,
  NOTIFICATION_TEMPLATES,
  selectForSegment,
} from './segment-registry';
import type { ResolvedSegment } from './segments';

const SEGMENTS_UNDER_TEST = [
  'musician',
  'dj_producer',
  'comedian',
  'athlete',
  'neutral',
] as const;

const FIXTURE_BIO: Record<string, string> = {
  musician: 'Singer-songwriter. New single out soon.',
  dj_producer: 'Techno DJ and producer, residency in Berlin.',
  comedian: 'Stand-up comedian touring clubs.',
  athlete: 'Marathon runner and coach.',
  neutral: '',
};

function selectedText(segment: ResolvedSegment): string[] {
  return [
    buildSegmentPromptSection(segment),
    ...selectForSegment(AGENT_PLAYBOOKS, segment).map(i => i.text ?? ''),
    ...selectForSegment(INSIGHT_ACTIONS, segment).map(i => i.text ?? ''),
    ...selectForSegment(FEATURES, segment).map(i => i.id.replace(/_/g, ' ')),
    ...selectForSegment(NOTIFICATION_TEMPLATES, segment).map(i =>
      i.id.replace(/_/g, ' ')
    ),
    ...selectForSegment(
      SCRIPT_LINES.filter(l => l.segments),
      segment
    ).map(l => l.text),
  ];
}

describe.each(SEGMENTS_UNDER_TEST)('segment %s', segment => {
  it('selected registry content has no other segment vocabulary', () => {
    for (const text of selectedText(segment)) {
      expect(crossSegmentTerms(text, segment), text).toEqual([]);
    }
  });

  it('agent system prompt context has no other segment playbook', () => {
    const parts = buildSystemPromptParts(
      {
        displayName: 'Sam',
        username: 'sam',
        bio: FIXTURE_BIO[segment] ?? '',
        genres: [],
        spotifyFollowers: null,
        spotifyPopularity: null,
        profileViews: 0,
        hasSocialLinks: false,
        hasMusicLinks: segment === 'musician',
        tippingStats: {
          tipClicks: 0,
          tipsSubmitted: 0,
          totalReceivedCents: 0,
          monthReceivedCents: 0,
        },
      },
      [],
      { aiCanUseTools: true, aiWeeklyMessageLimit: 10, segment }
    );
    const section = parts.stable.slice(
      parts.stable.indexOf('## Creator Segment'),
      parts.stable.indexOf('## Tipping & Monetization')
    );
    expect(section.length).toBeGreaterThan(0);
    expect(crossSegmentTerms(section, segment)).toEqual([]);
  });
});

describe('deliberate red', () => {
  it('detects a music playbook leaking to a comedian', () => {
    const leaked = buildSegmentPromptSection('musician');
    expect(crossSegmentTerms(leaked, 'comedian').length).toBeGreaterThan(0);
  });

  it('detects "put your song out Friday" for an athlete', () => {
    expect(
      crossSegmentTerms('Put your new single out on release day.', 'athlete')
    ).toEqual(expect.arrayContaining(['single', 'release day']));
  });

  it('neutral creators get no segment-specific vocabulary at all', () => {
    for (const text of selectedText('neutral')) {
      expect(crossSegmentTerms(text, 'neutral'), text).toEqual([]);
    }
  });
});
