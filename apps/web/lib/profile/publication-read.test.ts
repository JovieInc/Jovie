import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, neonMock } = vi.hoisted(() => {
  const queryMock = vi.fn();
  return { queryMock, neonMock: vi.fn(() => ({ query: queryMock })) };
});
vi.mock('@neondatabase/serverless', () => ({ neon: neonMock }));

import { readProfilePublished } from './publication-read';

beforeEach(() => {
  queryMock.mockReset();
  neonMock.mockClear();
});

describe('readProfilePublished', () => {
  it.each([
    [[{ is_public: true }], true],
    [[{ is_public: 't' }], true],
    [[{ is_public: false }], false],
    [[{ is_public: null }], false],
    [[], false],
  ])('maps %j to %s with one parameterized query', async (rows, expected) => {
    queryMock.mockResolvedValueOnce(rows);
    expect(
      await readProfilePublished('dualipa', { databaseUrl: 'postgres://x' })
    ).toBe(expected);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('$1'), [
      'dualipa',
    ]);
    expect(neonMock).toHaveBeenCalledWith(
      'postgres://x',
      expect.objectContaining({
        fetchOptions: expect.objectContaining({ signal: expect.anything() }),
      })
    );
  });

  it('throws (so callers fail closed) on storage errors and missing config', async () => {
    queryMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      readProfilePublished('dualipa', { databaseUrl: 'postgres://x' })
    ).rejects.toThrow('timeout');
    await expect(
      readProfilePublished('dualipa', { databaseUrl: '' })
    ).rejects.toThrow('DATABASE_URL');
  });
});
