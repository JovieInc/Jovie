import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetWrappedLink } = vi.hoisted(() => ({
  mockGetWrappedLink: vi.fn(),
}));

vi.mock('@/lib/services/link-wrapping', () => ({
  getWrappedLink: mockGetWrappedLink,
}));

vi.mock('@/components/molecules/ContentSectionHeader', () => ({
  ContentSectionHeader: () => null,
}));

vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: ({ children }: { readonly children: unknown }) =>
    children,
}));

vi.mock('@/components/organisms/StandaloneProductPage', () => ({
  StandaloneProductPage: ({ children }: { readonly children: unknown }) =>
    children,
}));

vi.mock('@/app/out/[id]/InterstitialClient', () => ({
  InterstitialClient: () => null,
}));

describe('out link metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not-found metadata when the wrapped link is missing', async () => {
    mockGetWrappedLink.mockResolvedValue(null);

    const { generateMetadata } = await import('@/app/out/[id]/page');
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'invalid-link' }),
    });

    expect(metadata.title).toBe('Not Found');
  });

  it('returns not-found metadata when the short id is invalid', async () => {
    const { generateMetadata } = await import('@/app/out/[id]/page');
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'x'.repeat(21) }),
    });

    expect(metadata.title).toBe('Not Found');
    expect(mockGetWrappedLink).not.toHaveBeenCalled();
  });

  it('keeps confirmation metadata for valid wrapped links', async () => {
    mockGetWrappedLink.mockResolvedValue({
      category: 'adult',
      clickCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      domain: 'example.com',
      id: 'wrapped-link-id',
      kind: 'sensitive',
      originalUrl: 'https://example.com',
      shortId: 'valid-link',
      titleAlias: 'External Link',
    });

    const { generateMetadata } = await import('@/app/out/[id]/page');
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'valid-link' }),
    });

    expect(metadata.title).toBe('Link Confirmation Required');
  });
});
