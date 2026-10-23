import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockArtistSearch = vi.hoisted(() => vi.fn());
const mockUseSpotifyConnect = vi.hoisted(() => vi.fn());

vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: mockArtistSearch,
}));

vi.mock(
  '@/components/features/dashboard/organisms/release-provider-matrix/releases-empty-state/hooks/useSpotifyConnect',
  () => ({ useSpotifyConnect: mockUseSpotifyConnect })
);

vi.mock('@/components/organisms/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => (
    <div role='dialog'>{children}</div>
  ),
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerButton: ({
    children,
    ...props
  }: {
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  DrawerSurfaceCard: ({
    children,
    ...props
  }: {
    children: ReactNode;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/atoms/ProviderIcon', () => ({
  ProviderIcon: () => <span aria-hidden='true'>Spotify</span>,
}));

vi.mock('@jovie/ui', () => ({
  Spinner: ({ label }: { label?: string }) => (
    <span role='status'>{label}</span>
  ),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img {...props} alt='' />,
}));

import { SpotifyConnectDialog } from './SpotifyConnectDialog';

describe('SpotifyConnectDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockArtistSearch.mockReturnValue({
      results: [],
      state: 'idle',
      error: null,
      search: vi.fn(),
      clear: vi.fn(),
    });
    mockUseSpotifyConnect.mockReturnValue({
      isPending: false,
      extractSpotifyArtistId: vi.fn(),
      connectFromUrl: vi.fn(),
      handleArtistSelect: vi.fn(),
    });
  });

  it('keeps the artist search at the 24px target-size floor', () => {
    render(<SpotifyConnectDialog open onOpenChange={vi.fn()} />);

    const search = screen.getByRole('combobox', {
      name: 'Search Spotify artists or paste a link',
    });

    expect(search).toBeEnabled();
    expect(search).toHaveClass('min-h-6');
  });
});
