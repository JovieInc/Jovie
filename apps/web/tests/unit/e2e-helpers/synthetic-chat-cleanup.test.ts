import { describe, expect, it, vi } from 'vitest';
import {
  deleteSyntheticChats,
  SYNTHETIC_CHAT_TITLE_PREFIX,
} from '../../e2e/helpers/synthetic-chat-cleanup';

const ok = (body: unknown = {}) => ({ ok: () => true, json: async () => body });

describe('deleteSyntheticChats', () => {
  it('deletes only prodcert synthetic chats and keeps real ones', async () => {
    const del = vi.fn(async (_url: string) => ok());
    const request = {
      get: vi.fn(async () =>
        ok({
          conversations: [
            {
              id: 'a',
              title: `${SYNTHETIC_CHAT_TITLE_PREFIX}: reply with the single word ok`,
            },
            { id: 'b', title: 'Plan my release' },
            { id: 'c', title: 'Prodcert synthetic check: reply' },
            { id: 'd', title: null },
          ],
        })
      ),
      delete: del,
    };
    expect(await deleteSyntheticChats(request, 'https://jov.ie')).toBe(2);
    expect(del.mock.calls.map(c => c[0])).toEqual([
      'https://jov.ie/api/chat/conversations/a',
      'https://jov.ie/api/chat/conversations/c',
    ]);
  });
});
