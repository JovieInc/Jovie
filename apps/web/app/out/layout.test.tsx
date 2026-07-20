import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetWrappedLink } = vi.hoisted(() => ({
  mockGetWrappedLink: vi.fn(),
}));

vi.mock('@/lib/services/link-wrapping', () => ({
  getWrappedLink: mockGetWrappedLink,
}));

// Presentational shells are passthroughs: this test targets the QueryClient
// provider contract of the /out/[id] route tree, not visual structure.
vi.mock('@/components/molecules/ContentSectionHeader', () => ({
  ContentSectionHeader: () => null,
}));

vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: ({ children }: { readonly children: ReactNode }) =>
    children,
}));

vi.mock('@/components/organisms/StandaloneProductPage', () => ({
  StandaloneProductPage: ({ children }: { readonly children: ReactNode }) =>
    children,
}));

import InterstitialPage from './[id]/page';
import OutLayout from './layout';

const SENSITIVE_WRAPPED_LINK = {
  category: 'adult',
  clickCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  domain: 'example.com',
  id: 'wrapped-link-id',
  kind: 'sensitive',
  originalUrl: 'https://example.com',
  shortId: 'valid-link',
  titleAlias: 'External Link',
};

function QueryClientProbe() {
  // Throws "No QueryClient set, use QueryClientProvider to set one" when the
  // layout subtree loses its QueryProvider (JOV-4328 / JOVIE-WEB-A6 / A7).
  useQueryClient();
  return <div data-testid='query-client-probe'>ok</div>;
}

describe('/out layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provides a QueryClient to the /out subtree', () => {
    render(
      <OutLayout>
        <QueryClientProbe />
      </OutLayout>
    );

    expect(screen.getByTestId('query-client-probe')).toBeInTheDocument();
  });

  it('renders the /out/[id] interstitial without a missing-QueryClient crash', async () => {
    mockGetWrappedLink.mockResolvedValue(SENSITIVE_WRAPPED_LINK);

    render(
      <OutLayout>
        {
          await InterstitialPage({
            params: Promise.resolve({ id: 'valid-link' }),
          })
        }
      </OutLayout>
    );

    expect(
      screen.getByRole('button', { name: /continue to link/i })
    ).toBeInTheDocument();
  });
});
