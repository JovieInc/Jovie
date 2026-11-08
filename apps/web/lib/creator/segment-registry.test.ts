import { describe, expect, it } from 'vitest';
import { buildSystemPromptParts } from '@/lib/chat/system-prompt';
import {
  AGENT_PLAYBOOKS,
  appliesToSegment,
  buildSegmentPromptSection,
  canSendNotification,
  excludeOtherSegments,
  isFeatureVisible,
  selectForSegment,
} from './segment-registry';

describe('segment registry selection', () => {
  it('neutral scope applies to everyone, tagged scope only to matches', () => {
    expect(appliesToSegment('neutral', 'neutral')).toBe(true);
    expect(appliesToSegment('neutral', 'comedian')).toBe(true);
    expect(appliesToSegment(['musician'], 'musician')).toBe(true);
    expect(appliesToSegment(['musician'], 'comedian')).toBe(false);
    expect(appliesToSegment(['musician'], 'neutral')).toBe(false);
  });

  it('hides artist-only features for non-artists and unknowns', () => {
    for (const f of ['releases', 'dsp_links', 'label_tools'] as const) {
      expect(isFeatureVisible(f, 'musician')).toBe(true);
      expect(isFeatureVisible(f, 'dj_producer')).toBe(true);
      expect(isFeatureVisible(f, 'comedian')).toBe(false);
      expect(isFeatureVisible(f, 'athlete')).toBe(false);
      expect(isFeatureVisible(f, 'neutral')).toBe(false);
    }
    expect(isFeatureVisible('profile', 'neutral')).toBe(true);
    expect(isFeatureVisible('tour_dates', 'comedian')).toBe(true);
    expect(isFeatureVisible('tour_dates', 'athlete')).toBe(false);
  });

  it('gates release notifications to music segments', () => {
    expect(canSendNotification('release_day_sms', 'musician')).toBe(true);
    expect(canSendNotification('release_day_sms', 'comedian')).toBe(false);
  });

  it('excludeOtherSegments keeps everything when no segment is resolved', () => {
    const items = [
      { id: 'a', segments: ['musician'] as const },
      { id: 'b', segments: 'neutral' as const },
      { id: 'c' },
    ];
    expect(excludeOtherSegments(items, undefined)).toHaveLength(3);
    expect(excludeOtherSegments(items, 'neutral')).toHaveLength(3);
    expect(excludeOtherSegments(items, 'comedian').map(i => i.id)).toEqual([
      'b',
      'c',
    ]);
  });

  it('every playbook declares a scope', () => {
    for (const p of AGENT_PLAYBOOKS) expect(p.segments).toBeDefined();
    expect(
      selectForSegment(AGENT_PLAYBOOKS, 'comedian').length
    ).toBeGreaterThan(1);
  });
});

describe('agent prompt segment section', () => {
  it('comedian prompt carries no music playbook', () => {
    const text = buildSegmentPromptSection('comedian');
    expect(text).toMatch(/show date/);
    expect(text).not.toMatch(/Friday|pre-save|playlist/i);
  });

  it('system prompt includes the inferred segment section', () => {
    const base = {
      displayName: 'Sam',
      username: 'sam',
      bio: 'Stand-up comedian touring clubs',
      genres: [],
      spotifyFollowers: null,
      spotifyPopularity: null,
      profileViews: 0,
      hasSocialLinks: false,
      hasMusicLinks: false,
      tippingStats: {
        tipClicks: 0,
        tipsSubmitted: 0,
        totalReceivedCents: 0,
        monthReceivedCents: 0,
      },
    };
    const parts = buildSystemPromptParts(base, [], {
      aiCanUseTools: true,
      aiWeeklyMessageLimit: 10,
    });
    expect(parts.stable).toContain('## Creator Segment');
    expect(parts.stable).not.toContain('Friday is the standard release day');
  });
});
