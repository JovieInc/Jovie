import { describe, expect, it } from 'vitest';
import {
  getPaletteConversationSubtitle,
  rankPaletteConversations,
  rankPaletteReleases,
} from '@/lib/commands/palette-ranking';
import type { ChatConversation } from '@/lib/queries/useChatConversationsQuery';

function conversation(
  id: string,
  updatedAt: string,
  latestTurnStatus: ChatConversation['latestTurnStatus'] = 'completed'
): ChatConversation {
  return {
    id,
    title: id,
    createdAt: updatedAt,
    updatedAt,
    latestTurnStatus,
  };
}

describe('palette ranking', () => {
  it('ranks chats by current context, active state, attention state, and recency', () => {
    const source = [
      conversation('recent-complete', '2026-08-18T04:00:00.000Z'),
      conversation('failed', '2026-08-18T01:00:00.000Z', 'failed_timeout'),
      conversation('active', '2026-08-17T01:00:00.000Z', 'streaming'),
      conversation('current', '2026-08-16T01:00:00.000Z'),
      conversation('older-complete', '2026-08-15T01:00:00.000Z'),
    ];

    expect(
      rankPaletteConversations(source, 'current').map(chat => chat.id)
    ).toEqual([
      'current',
      'active',
      'failed',
      'recent-complete',
      'older-complete',
    ]);
    expect(source.map(chat => chat.id)).toEqual([
      'recent-complete',
      'failed',
      'active',
      'current',
      'older-complete',
    ]);
  });

  it('exposes the reason each prioritized chat is ranked', () => {
    expect(
      getPaletteConversationSubtitle(
        conversation('current', '2026-08-18T04:00:00.000Z'),
        'current'
      )
    ).toBe('Current chat');
    expect(
      getPaletteConversationSubtitle(
        conversation('active', '2026-08-18T04:00:00.000Z', 'running'),
        null
      )
    ).toBe('Active chat');
    expect(
      getPaletteConversationSubtitle(
        conversation('failed', '2026-08-18T04:00:00.000Z', 'failed_network'),
        null
      )
    ).toBe('Needs attention');
    expect(
      getPaletteConversationSubtitle(
        conversation('complete', '2026-08-18T04:00:00.000Z'),
        null
      )
    ).toBe('Recent chat');
  });

  it('ranks unfinished releases before the newest completed catalog entries', () => {
    const source = [
      {
        id: 'released-new',
        status: 'released' as const,
        releaseDate: '2026-08-18',
      },
      {
        id: 'scheduled',
        status: 'scheduled' as const,
        releaseDate: '2026-09-01',
      },
      { id: 'draft-old', status: 'draft' as const, releaseDate: '2026-07-01' },
      { id: 'draft-new', status: 'draft' as const, releaseDate: '2026-08-01' },
      {
        id: 'released-old',
        status: 'released' as const,
        releaseDate: '2025-01-01',
      },
    ];

    expect(rankPaletteReleases(source).map(release => release.id)).toEqual([
      'draft-new',
      'draft-old',
      'scheduled',
      'released-new',
      'released-old',
    ]);
    expect(source[0]?.id).toBe('released-new');
  });
});
