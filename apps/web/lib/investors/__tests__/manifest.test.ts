import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadFile = vi.fn();

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();

  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: mockReadFile,
    },
    default: {
      ...actual,
      promises: {
        ...actual.promises,
        readFile: mockReadFile,
      },
    },
  };
});

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');

  return {
    ...actual,
    default: actual,
  };
});

const MOCK_MANIFEST = JSON.stringify({
  pages: [
    {
      slug: 'memo',
      file: 'investor-memo.md',
      title: 'Investor Memo',
      nav: true,
    },
    { slug: 'ai', file: 'ai.md', title: 'AI Strategy', nav: true },
    { slug: 'gtm', file: 'gtm.md', title: 'Go-to-Market', nav: true },
  ],
  deck: {
    slides: ['01-cover.md', '02-problem.md'],
    downloadFilename: 'Jovie-Pitch-Deck.pdf',
  },
});

describe('getInvestorManifest', () => {
  beforeEach(() => {
    vi.resetModules();
    mockReadFile.mockReset();
    mockReadFile.mockResolvedValue(MOCK_MANIFEST);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('loads and parses manifest.json', async () => {
    const { getInvestorManifest } = await import('../manifest');
    const manifest = await getInvestorManifest();

    expect(manifest.pages).toHaveLength(3);
    expect(manifest.deck.slides).toHaveLength(2);
    expect(manifest.deck.downloadFilename).toBe('Jovie-Pitch-Deck.pdf');
  });

  it('returns pages with required properties', async () => {
    const { getInvestorManifest } = await import('../manifest');
    const manifest = await getInvestorManifest();

    for (const page of manifest.pages) {
      expect(page).toHaveProperty('slug');
      expect(page).toHaveProperty('file');
      expect(page).toHaveProperty('title');
      expect(page).toHaveProperty('nav');
      expect(typeof page.slug).toBe('string');
      expect(typeof page.file).toBe('string');
      expect(typeof page.title).toBe('string');
      expect(typeof page.nav).toBe('boolean');
    }
  });

  it('returns deck config with markdown slides', async () => {
    const { getInvestorManifest } = await import('../manifest');
    const manifest = await getInvestorManifest();

    expect(Array.isArray(manifest.deck.slides)).toBe(true);
    for (const slide of manifest.deck.slides) {
      expect(slide).toMatch(/\.md$/);
    }
  });

  it('reads from correct file path', async () => {
    const { getInvestorManifest } = await import('../manifest');
    await getInvestorManifest();

    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('content/investors/manifest.json'),
      'utf-8'
    );
  });

  it('caches result in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { getInvestorManifest } = await import('../manifest');

    await getInvestorManifest();
    await getInvestorManifest();

    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it('reloads on every call in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { getInvestorManifest } = await import('../manifest');

    await getInvestorManifest();
    await getInvestorManifest();

    expect(mockReadFile).toHaveBeenCalledTimes(2);
  });
});
