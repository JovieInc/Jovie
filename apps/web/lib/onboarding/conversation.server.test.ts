import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  where: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, insert: mocks.insert },
}));

import {
  findOnboardingConversation,
  readOnboardingMessages,
  restartOwnedOnboardingConversation,
} from './conversation.server';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.select.mockReturnValue({ from: () => ({ where: mocks.where }) });
  mocks.where.mockReturnValue({ orderBy: mocks.order });
  mocks.order.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockResolvedValue([]);
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id: 'new-context' }]);
});

function selection(index = 0) {
  return new PgDialect().sqlToQuery(mocks.where.mock.calls[index][0]);
}

describe('durable onboarding ownership and recovery', () => {
  it('recovers only the verified account onboarding row even with another cookie present', async () => {
    mocks.limit.mockResolvedValue([
      { id: 'owned-a', sessionId: 'signed-session-a' },
    ]);
    expect(
      await findOnboardingConversation({
        userId: 'account-a',
        sessionId: 'stale-cookie-b',
      })
    ).toEqual({ id: 'owned-a', sessionId: 'signed-session-a', owned: true });
    expect(selection().params).toEqual(['account-a']);
    expect(selection().sql).toContain('"chat_conversations"."user_id" = $1');
    expect(selection().sql).toContain(
      '"chat_conversations"."session_id" is not null'
    );
    expect(mocks.select).toHaveBeenCalledOnce();
  });
  it('resumes an anonymous cookie only while both account and creator ownership remain unset', async () => {
    mocks.limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'anonymous', sessionId: 'cookie-a' }]);
    expect(
      await findOnboardingConversation({
        userId: 'account-new',
        sessionId: 'cookie-a',
      })
    ).toMatchObject({ id: 'anonymous', owned: false });
    const query = selection(1);
    expect(query.params).toEqual(['cookie-a']);
    expect(query.sql).toContain('"chat_conversations"."user_id" is null');
    expect(query.sql).toContain(
      '"chat_conversations"."creator_profile_id" is null'
    );
  });
  it('performs no database lookup when neither a verified account nor signed cookie exists', async () => {
    expect(
      await findOnboardingConversation({ userId: null, sessionId: null })
    ).toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it('returns no conversation when a signed cookie already belongs to another account', async () => {
    expect(
      await findOnboardingConversation({
        userId: null,
        sessionId: 'claimed-cookie',
      })
    ).toBeNull();
    expect(selection().sql).toContain('"chat_conversations"."user_id" is null');
  });
  it('hydrates saved text and assistant tool artifacts but ignores system rows and user-supplied tools', async () => {
    const event = {
      schemaVersion: 2,
      toolCallId: 'handle-check',
      toolName: 'checkHandle',
      state: 'succeeded',
      input: { handle: 'artist' },
      output: { available: true },
      uiHint: 'artifact',
    };
    mocks.limit.mockResolvedValue([
      {
        id: 'db-user',
        clientMessageId: 'client-user',
        role: 'user',
        content: 'My artist',
        toolCalls: [event],
      },
      {
        id: 'db-assistant',
        clientMessageId: null,
        role: 'assistant',
        content: '',
        toolCalls: [event],
      },
      {
        id: 'system',
        role: 'system',
        content: 'private prompt',
        toolCalls: null,
      },
    ]);
    const messages = await readOnboardingMessages('authorized-conversation');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      id: 'client-user',
      role: 'user',
      parts: [{ type: 'text', text: 'My artist' }],
    });
    expect(messages[1]).toMatchObject({
      id: 'db-assistant',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolName: 'checkHandle',
          state: 'output-available',
          output: { available: true },
        },
      ],
    });
    expect(selection().params).toEqual(['authorized-conversation']);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('starts a fresh owned context without deleting or relinking prior history', async () => {
    await restartOwnedOnboardingConversation('account-a');
    expect(mocks.values).toHaveBeenCalledWith({
      userId: 'account-a',
      sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      title: 'Getting started',
    });
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it('fails closed when the new context was not durably inserted', async () => {
    mocks.returning.mockResolvedValue([]);
    await expect(
      restartOwnedOnboardingConversation('account-a')
    ).rejects.toThrow('not saved');
  });
});
