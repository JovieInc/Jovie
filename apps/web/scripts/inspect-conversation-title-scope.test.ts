// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), writeFile: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({ neon: vi.fn(() => mocks.query) }));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: mocks.writeFile,
    default: { ...actual, writeFile: mocks.writeFile },
  };
});

import { inspectConversationTitleScope } from './inspect-conversation-title-scope';

const userId = '11111111-1111-4111-8111-111111111111';
const creatorProfileId = '22222222-2222-4222-8222-222222222222';
const message = 'Prod health check: reply with one short sentence.';
const record = {
  id: '33333333-3333-4333-8333-333333333333',
  userId,
  creatorProfileId,
  title: message,
  firstUserMessage: message,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DATABASE_URL', 'postgres://test.invalid/test');
  mocks.query
    .mockResolvedValueOnce([{ id: userId }])
    .mockResolvedValueOnce([record]);
  mocks.writeFile.mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe('title scope inspection command', () => {
  it('resolves the explicit email then scopes the bounded read to that actor and writes a private receipt', async () => {
    await inspectConversationTitleScope(['verified@example.test', '/private']);
    expect(mocks.query.mock.calls[0][1]).toBe('verified@example.test');
    expect(mocks.query.mock.calls[1][1]).toBe(userId);
    expect(mocks.query.mock.calls[1][0].join('')).toContain('LIMIT 201');
    const [path, body, options] = mocks.writeFile.mock.calls[0];
    expect(path).toBe(
      `/private/conversation-title-repair-${creatorProfileId}.json`
    );
    expect(options).toEqual({ mode: 0o600, flag: 'wx' });
    expect(JSON.parse(body)).toMatchObject({
      userId,
      creatorProfileId,
      repairs: [
        {
          conversationId: record.id,
          oldTitle: message,
          newTitle: 'Prod health check',
        },
      ],
    });
  });
  it('fails closed when the owner is missing or ambiguous', async () => {
    for (const owners of [[], [{ id: userId }, { id: creatorProfileId }]]) {
      mocks.query.mockReset().mockResolvedValueOnce(owners);
      await expect(
        inspectConversationTitleScope(['verified@example.test', '/private'])
      ).rejects.toThrow('exactly one');
    }
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
  it('fails closed at the candidate bound', async () => {
    mocks.query
      .mockReset()
      .mockResolvedValueOnce([{ id: userId }])
      .mockResolvedValueOnce(Array(201).fill(record));
    await expect(
      inspectConversationTitleScope(['verified@example.test', '/private'])
    ).rejects.toThrow('bound exceeded');
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
  it('preserves renamed, unrelated-owner and profile-less records', async () => {
    mocks.query
      .mockReset()
      .mockResolvedValueOnce([{ id: userId }])
      .mockResolvedValueOnce([
        { ...record, title: 'My title' },
        { ...record, userId: creatorProfileId },
        { ...record, creatorProfileId: null },
      ]);
    await inspectConversationTitleScope(['verified@example.test', '/private']);
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
  it('requires an email, output directory and database connection before reading', async () => {
    await expect(inspectConversationTitleScope([])).rejects.toThrow('Expected');
    vi.stubEnv('DATABASE_URL', '');
    await expect(
      inspectConversationTitleScope(['verified@example.test', '/private'])
    ).rejects.toThrow('Expected');
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
