import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  owner: '11111111-1111-4111-8111-111111111111' as string | null,
  keyEnabled: true,
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  session: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: state.owner }),
}));
vi.mock('@/lib/auth/session', () => ({
  UnauthorizedSessionError: class extends Error {},
  withDbSessionTx: state.session,
}));
vi.mock('@/lib/utils/pii-encryption', () => ({
  isPIIEncryptionEnabled: () => state.keyEnabled,
  encryptPII: state.encrypt,
  decryptPII: state.decrypt,
}));

import {
  deleteRoyaltySource,
  listRoyaltyStatementLines,
  listRoyaltyStatementVersions,
  persistRoyaltyStatement,
  purgeExpiredRoyaltySources,
  type RoyaltyImport,
  readRoyaltySourceEvidence,
} from './royalty-repository';

const sourceId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const original = Buffer.from('synthetic statement');
const digest = createHash('sha256').update(original).digest('hex');
function input(): RoyaltyImport {
  return {
    connectorAccountId: '44444444-4444-4444-8444-444444444444',
    importKey: 'import',
    statementKey: 'statement',
    version: 1,
    parserVersion: 'parser-v1',
    evidence: original,
    expiresAt: new Date(Date.now() + 60_000),
    lines: [
      {
        rowIdentity: 'row',
        rowNumber: 1,
        sourceRowHash: digest,
        amount: '12345678901234567890.000000012300',
        currency: 'EUR',
      },
    ],
  };
}
function query(rows: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    for: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    orderBy: vi.fn(async () => rows),
    limit: vi.fn(async () => rows),
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  };
  return chain;
}
function storedSource() {
  return {
    id: sourceId,
    sourceHash: digest,
    encryptedEvidence: 'a:b:c',
    expiresAt: new Date(Date.now() + 60_000),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  state.owner = '11111111-1111-4111-8111-111111111111';
  state.keyEnabled = true;
  state.encrypt.mockReturnValue('a:b:c');
  state.decrypt.mockReturnValue(
    JSON.stringify({
      owner: state.owner,
      sourceHash: digest,
      bytes: original.toString('base64'),
    })
  );
  state.select.mockReturnValue(query([{ active: true }]));
  state.session.mockImplementation(async fn =>
    fn({ select: state.select, insert: state.insert, delete: state.remove })
  );
});

describe('authenticated royalty repository', () => {
  it('rejects every operation before opening a session without a financial owner', async () => {
    for (const owner of [null, 'creator-profile-id']) {
      state.owner = owner;
      for (const call of [
        () => persistRoyaltyStatement(input()),
        () => readRoyaltySourceEvidence(sourceId),
        () => listRoyaltyStatementVersions('statement'),
        () => listRoyaltyStatementLines(versionId),
        () => deleteRoyaltySource(sourceId),
        () => purgeExpiredRoyaltySources(),
      ]) {
        await expect(call()).rejects.toThrow();
      }
    }
    expect(state.session).not.toHaveBeenCalled();
  });
  it('rejects invalid evidence, decimal Numbers, FX and retention input before persistence', async () => {
    const bad = [
      { evidence: Buffer.alloc(0) },
      { evidence: Buffer.alloc(10 * 1024 * 1024 + 1) },
      { expiresAt: new Date(0) },
      { lines: [{ ...input().lines[0], amount: 1 }] },
      { lines: [{ ...input().lines[0], amount: 'NaN' }] },
      { lines: [{ ...input().lines[0], fxRate: 1.25 }] },
    ];
    for (const patch of bad) {
      await expect(
        persistRoyaltyStatement({ ...input(), ...patch } as RoyaltyImport)
      ).rejects.toThrow();
    }
    state.keyEnabled = false;
    await expect(persistRoyaltyStatement(input())).rejects.toThrow(
      'encryption unavailable'
    );
    state.keyEnabled = true;
    state.encrypt.mockReturnValue(null);
    await expect(persistRoyaltyStatement(input())).rejects.toThrow(
      'encryption failed'
    );
    expect(state.session).not.toHaveBeenCalled();
  });
  it('pins the authenticated owner, encrypts before DB work and preserves supplied decimal strings', async () => {
    const values = vi.fn();
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ id: sourceId }])
      .mockResolvedValueOnce([{ id: versionId }])
      .mockResolvedValueOnce([{ id: 'line' }]);
    values.mockReturnValue({ returning });
    state.insert.mockReturnValue({ values });
    const receipt = await persistRoyaltyStatement(input());
    expect(receipt).toEqual({
      sourceId,
      statementVersionId: versionId,
      sourceHash: digest,
      lineCount: 1,
    });
    expect(state.session).toHaveBeenCalledWith(expect.any(Function), {
      clerkUserId: state.owner,
    });
    expect(state.encrypt.mock.invocationCallOrder[0]).toBeLessThan(
      state.session.mock.invocationCallOrder[0]
    );
    expect(values.mock.calls[2][0]).toEqual([
      expect.objectContaining({
        ownerUserId: state.owner,
        amount: input().lines[0].amount,
        currency: 'EUR',
        fxRate: null,
        fxCurrency: null,
        fxAsOf: null,
      }),
    ]);
  });
  it('batches large imports below the database parameter limit', async () => {
    const original = input();
    original.lines = Array.from({ length: 1001 }, (_, i) => ({
      ...original.lines[0],
      rowIdentity: `row-${i}`,
      rowNumber: i + 1,
    }));
    const values = vi.fn();
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ id: sourceId }])
      .mockResolvedValueOnce([{ id: versionId }])
      .mockResolvedValueOnce(
        Array.from({ length: 1000 }, () => ({ id: 'line' }))
      )
      .mockResolvedValueOnce([{ id: 'last' }]);
    values.mockReturnValue({ returning });
    state.insert.mockReturnValue({ values });
    expect((await persistRoyaltyStatement(original)).lineCount).toBe(1001);
    expect(values.mock.calls[2][0]).toHaveLength(1000);
    expect(values.mock.calls[3][0]).toHaveLength(1);
  });
  it('never returns success for missing source, version or line persistence results', async () => {
    for (const resultSets of [
      [[]],
      [[{ id: sourceId }], []],
      [[{ id: sourceId }], [{ id: versionId }], []],
    ]) {
      const returning = vi.fn();
      for (const rows of resultSets) returning.mockResolvedValueOnce(rows);
      state.insert.mockReturnValue({ values: () => ({ returning }) });
      await expect(persistRoyaltyStatement(input())).rejects.toThrow(
        'persistence failed'
      );
    }
  });
  it('denies stale sessions for deleted and missing owners', async () => {
    for (const rows of [[], [{ active: false }]]) {
      state.select.mockReturnValue(query(rows));
      await expect(listRoyaltyStatementVersions('statement')).rejects.toThrow(
        'Financial owner unavailable'
      );
    }
  });
  it('returns exact decrypted bytes and fails closed for missing, expired or corrupt evidence', async () => {
    const read = (source: unknown) => {
      state.select
        .mockReturnValueOnce(query([{ active: true }]))
        .mockReturnValueOnce(query(source ? [source] : []));
      return readRoyaltySourceEvidence(sourceId);
    };
    expect(Buffer.from((await read(storedSource()))!)).toEqual(original);
    expect(await read(null)).toBeNull();
    await expect(
      read({ ...storedSource(), encryptedEvidence: 'plaintext' })
    ).rejects.toThrow('integrity failure');
    expect(
      await read({ ...storedSource(), expiresAt: new Date(0) })
    ).toBeNull();
    state.keyEnabled = false;
    await expect(read(storedSource())).rejects.toThrow(
      'encryption unavailable'
    );
    state.keyEnabled = true;
    for (const envelope of [
      {
        owner: sourceId,
        sourceHash: digest,
        bytes: original.toString('base64'),
      },
      {
        owner: state.owner,
        sourceHash: 'c'.repeat(64),
        bytes: original.toString('base64'),
      },
      { owner: state.owner, sourceHash: digest, bytes: 'dGFtcGVyZWQ=' },
    ]) {
      state.decrypt.mockReturnValue(JSON.stringify(envelope));
      await expect(read(storedSource())).rejects.toThrow('integrity failure');
    }
  });
  it('reads versions and precise lines and reports only persisted owner erasures', async () => {
    state.select
      .mockReturnValueOnce(query([{ active: true }]))
      .mockReturnValueOnce(query([{ version: 2 }]));
    expect(await listRoyaltyStatementVersions('statement')).toEqual([
      { version: 2 },
    ]);
    state.select
      .mockReturnValueOnce(query([{ active: true }]))
      .mockReturnValueOnce(query([{ amount: '0.0000000001' }]));
    expect(await listRoyaltyStatementLines(versionId)).toEqual([
      { amount: '0.0000000001' },
    ]);
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ id: sourceId }])
      .mockResolvedValueOnce([]);
    state.remove.mockReturnValue({ where: () => ({ returning }) });
    expect(await deleteRoyaltySource(sourceId)).toBe(true);
    expect(await deleteRoyaltySource(sourceId)).toBe(false);
  });
  it('performs a bounded retention deletion and skips writes for an empty batch', async () => {
    state.select
      .mockReturnValueOnce(query([{ active: true }]))
      .mockReturnValueOnce(query([{ id: sourceId }]));
    const where = vi.fn().mockResolvedValue([]);
    state.remove.mockReturnValue({ where });
    expect(await purgeExpiredRoyaltySources()).toBe(1);
    expect(where).toHaveBeenCalledOnce();
    state.select
      .mockReturnValueOnce(query([{ active: true }]))
      .mockReturnValueOnce(query([]));
    state.remove.mockClear();
    expect(await purgeExpiredRoyaltySources()).toBe(0);
    expect(state.remove).not.toHaveBeenCalled();
  });
});
