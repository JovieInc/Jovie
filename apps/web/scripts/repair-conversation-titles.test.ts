// @vitest-environment node
import { createHash } from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: mocks.readFile,
    writeFile: mocks.writeFile,
    default: {
      ...actual,
      readFile: mocks.readFile,
      writeFile: mocks.writeFile,
    },
  };
});
vi.mock('@neondatabase/serverless', () => ({ neon: vi.fn(() => ({})) }));
vi.mock('drizzle-orm/neon-http', () => ({
  drizzle: vi.fn(() => ({ select: mocks.select, update: mocks.update })),
}));

import { repairConversationTitles } from './repair-conversation-titles';

const userId = '11111111-1111-4111-8111-111111111111';
const creatorProfileId = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const oldTitle = 'Prod health check: reply with one short sentence.';
const newTitle = 'Prod health check';
const current = {
  id,
  userId,
  creatorProfileId,
  title: oldTitle,
  firstUserMessage: oldTitle,
};
const repair = {
  conversationId: id,
  userId,
  creatorProfileId,
  oldTitle,
  newTitle,
  firstMessageSha256: createHash('sha256').update(oldTitle).digest('hex'),
};
const mapping = {
  version: 'jovie.conversation-title-repair/v1',
  userId,
  creatorProfileId,
  repairs: [repair],
};
const args = (mode = 'apply') => [
  '--user-id',
  userId,
  '--profile-id',
  creatorProfileId,
  `--${mode}`,
  '/private/receipt.json',
];
let readWhere: ReturnType<typeof vi.fn>;
let writeWhere: ReturnType<typeof vi.fn>;
let set: ReturnType<typeof vi.fn>;
let returning: ReturnType<typeof vi.fn>;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DATABASE_URL', 'postgres://test.invalid/test');
  mocks.readFile.mockResolvedValue(JSON.stringify(mapping));
  mocks.writeFile.mockResolvedValue(undefined);
  const limit = vi.fn().mockResolvedValue([current]);
  readWhere = vi.fn().mockReturnValue({ limit });
  mocks.select.mockReturnValue({
    from: vi.fn().mockReturnValue({ where: readWhere }),
  });
  returning = vi.fn().mockResolvedValue([{ id }]);
  writeWhere = vi.fn().mockReturnValue({ returning });
  set = vi.fn().mockReturnValue({ where: writeWhere });
  mocks.update.mockReturnValue({ set });
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const summary = () => JSON.parse(String(log.mock.calls.at(-1)?.[0]));
function readRows(rows: unknown[]) {
  readWhere.mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) });
}

describe('conversation title repair command', () => {
  it('writes only a title using owner/profile, expected-title and first-message compare-and-swap', async () => {
    await repairConversationTitles(args());
    expect(set).toHaveBeenCalledWith({ title: newTitle });
    const query = new PgDialect().sqlToQuery(writeWhere.mock.calls[0][0]);
    expect(query.params).toEqual(
      expect.arrayContaining([userId, creatorProfileId, id, oldTitle])
    );
    expect(query.sql).toContain('m.conversation_id = chat_conversations.id');
    expect(query.sql).toContain('"title" =');
    expect(query.sql).toContain('"user_id" =');
    expect(query.sql).toContain('"creator_profile_id" =');
    expect(summary()).toMatchObject({ updated: 1, unchanged: 0, skipped: 0 });
  });
  it('is idempotent when the same mapping is applied again', async () => {
    readRows([{ ...current, title: newTitle }]);
    await repairConversationTitles(args());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(summary()).toMatchObject({ updated: 0, unchanged: 1, skipped: 0 });
  });
  it('rolls back only the matched replacement using the original-title mapping', async () => {
    readRows([{ ...current, title: newTitle }]);
    await repairConversationTitles(args('rollback'));
    expect(set).toHaveBeenCalledWith({ title: oldTitle });
    expect(
      new PgDialect().sqlToQuery(writeWhere.mock.calls[0][0]).params
    ).toContain(newTitle);
    expect(summary()).toMatchObject({ mode: 'rollback', updated: 1 });
  });
  it('plans a private, exclusively-created original-title/hash receipt', async () => {
    readWhere.mockResolvedValue([current]);
    await repairConversationTitles(args('plan'));
    const [path, body, options] = mocks.writeFile.mock.calls[0];
    expect(path).toBe('/private/receipt.json');
    expect(options).toEqual({ mode: 0o600, flag: 'wx' });
    expect(JSON.parse(body)).toEqual(mapping);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([
    ['owner', { ...mapping, userId: id }],
    ['profile', { ...mapping, creatorProfileId: id }],
    ['record scope', { ...mapping, repairs: [{ ...repair, userId: id }] }],
    ['duplicate ID', { ...mapping, repairs: [repair, repair] }],
  ])(
    'rejects a mismatched %s mapping before querying or writing',
    async (_, invalid) => {
      mocks.readFile.mockResolvedValue(JSON.stringify(invalid));
      await expect(repairConversationTitles(args())).rejects.toThrow();
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );
  it.each([
    ['record_missing', []],
    ['message_missing', [{ ...current, firstUserMessage: null }]],
    ['message_changed', [{ ...current, firstUserMessage: 'Changed message' }]],
    ['title_changed', [{ ...current, title: 'My renamed title' }]],
  ])('preserves history when %s', async (reason, rows) => {
    readRows(rows);
    await repairConversationTitles(args());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(summary()).toMatchObject({
      updated: 0,
      skipped: 1,
      skippedReasons: { [reason]: 1 },
    });
  });
  it('rejects a hand-edited replacement that does not match the real subject', async () => {
    mocks.readFile.mockResolvedValue(
      JSON.stringify({
        ...mapping,
        repairs: [{ ...repair, newTitle: 'Invented subject' }],
      })
    );
    await repairConversationTitles(args());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(summary().skippedReasons).toEqual({ mapping_subject_mismatch: 1 });
  });
  it('detects a concurrent title/body change rather than overwriting it', async () => {
    returning.mockResolvedValue([]);
    await repairConversationTitles(args());
    expect(summary()).toMatchObject({
      updated: 0,
      skipped: 1,
      skippedReasons: { concurrent_change: 1 },
    });
  });
  it('requires valid explicit scope and exactly one operation', async () => {
    await expect(
      repairConversationTitles(['--user-id', 'invalid'])
    ).rejects.toThrow();
    await expect(repairConversationTitles(args().slice(0, 4))).rejects.toThrow(
      'exactly one'
    );
    await expect(
      repairConversationTitles([
        ...args(),
        '--rollback',
        '/private/receipt.json',
      ])
    ).rejects.toThrow('exactly one');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
