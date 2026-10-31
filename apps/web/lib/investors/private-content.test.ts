import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: mocks.rows }) }),
    }),
  },
}));
vi.mock('@/lib/db/schema/investors', () => ({
  investorPortalContent: { path: 'path', bodyBase64: 'b', contentType: 'c' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));

import {
  InvestorContentMissingError,
  openInvestorPrivateFile,
  readInvestorPrivateText,
} from './private-content';

const row = (text: string, contentType = 'text/markdown') => ({
  bodyBase64: Buffer.from(text).toString('base64'),
  contentType,
});

describe('investor private content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'production');
  });

  it('reads private content from the database by path', async () => {
    mocks.rows.mockResolvedValue([row('# memo')]);

    await expect(
      readInvestorPrivateText('content/investors/investor-memo.md')
    ).resolves.toBe('# memo');
  });

  it('streams binary content with its size and type', async () => {
    mocks.rows.mockResolvedValue([row('%PDF-1.7', 'application/pdf')]);

    const file = await openInvestorPrivateFile(
      'assets/investor-deck/Jovie-Pitch-Deck.pdf',
      'application/pdf'
    );

    expect(file.contentType).toBe('application/pdf');
    expect(file.size).toBe(8);
    expect(await new Response(file.stream).text()).toBe('%PDF-1.7');
  });

  it('reports a missing row as ENOENT', async () => {
    mocks.rows.mockResolvedValue([]);

    await expect(
      readInvestorPrivateText('content/investors/manifest.json')
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('treats a missing table (42P01) as missing content, not a crash', async () => {
    mocks.rows.mockRejectedValue(
      Object.assign(new Error('x'), { code: '42P01' })
    );

    await expect(
      readInvestorPrivateText('content/investors/manifest.json')
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rethrows other database errors', async () => {
    mocks.rows.mockRejectedValue(
      Object.assign(new Error('boom'), { code: '08006' })
    );

    await expect(
      readInvestorPrivateText('content/investors/manifest.json')
    ).rejects.toThrow('boom');
  });

  it.each(['../secret.md', '/etc/passwd', 'a/../b.md', 'a//b.md', ''])(
    'rejects unsafe path %j before touching storage',
    async relativePath => {
      await expect(
        openInvestorPrivateFile(relativePath, 'text/plain')
      ).rejects.toBeInstanceOf(InvestorContentMissingError);
      expect(mocks.rows).not.toHaveBeenCalled();
    }
  );

  it('never reads a local checkout in production', async () => {
    vi.stubEnv('JOVIE_PRIVATE_DIR', '/tmp/does-not-matter');
    mocks.rows.mockResolvedValue([row('db wins')]);

    await expect(
      readInvestorPrivateText('content/investors/manifest.json')
    ).resolves.toBe('db wins');
  });
});
