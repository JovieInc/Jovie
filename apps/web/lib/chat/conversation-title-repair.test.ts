import { describe, expect, it } from 'vitest';
import { planConversationTitleRepairs } from './conversation-title-repair';
import { sanitizeConversationTitle } from './title';

const scope = { userId: 'owner', creatorProfileId: 'artist-profile' };
const firstUserMessage = `Help me with this work.\n${JSON.stringify({ workId: '808c9f4d-505c-4000-8000-000000000001', workTitle: '夜の歌 "Live" 🎵' })}`;
const affected = {
  id: 'conversation-1',
  ...scope,
  firstUserMessage,
  title: sanitizeConversationTitle(firstUserMessage, 50),
};

describe('historical conversation title repair planning', () => {
  it('produces an exact reversible old-to-new mapping without changing the source record', () => {
    const snapshot = structuredClone(affected);
    expect(planConversationTitleRepairs([affected], scope)).toEqual([
      {
        conversationId: affected.id,
        ...scope,
        oldTitle: affected.title,
        newTitle: '夜の歌 "Live" 🎵',
      },
    ]);
    expect(affected).toEqual(snapshot);
  });

  it('preserves renamed titles, other actors, other profiles, and unrelated metadata discussions', () => {
    expect(
      planConversationTitleRepairs(
        [
          { ...affected, title: 'My release discussion' },
          { ...affected, userId: 'another-owner' },
          { ...affected, creatorProfileId: 'another-profile' },
          {
            ...affected,
            firstUserMessage: 'Explain "workId" in the API',
            title: 'Explain "workId" in the API',
          },
          {
            ...affected,
            firstUserMessage: 'Health check plan',
            title: 'Health check plan',
          },
        ],
        scope
      )
    ).toEqual([]);
  });

  it('is idempotent after application', () => {
    const [repair] = planConversationTitleRepairs([affected], scope);
    expect(
      planConversationTitleRepairs(
        [{ ...affected, title: repair.newTitle }],
        scope
      )
    ).toEqual([]);
  });
});
