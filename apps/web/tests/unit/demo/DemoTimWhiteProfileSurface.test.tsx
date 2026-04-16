import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

const { mockSearchParams, mockStaticArtistPage } = vi.hoisted(() => ({
  mockSearchParams: vi.fn(() => new URLSearchParams()),
  mockStaticArtistPage: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams(),
}));

vi.mock('@/features/profile/StaticArtistPage', () => ({
  StaticArtistPage: (props: Record<string, unknown>) => {
    mockStaticArtistPage(props);
    return <div data-testid='static-artist-page' />;
  },
}));

vi.mock('@/features/demo/DemoClientProviders', () => ({
  DemoClientProviders: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

async function renderSurface(search = '') {
  mockSearchParams.mockReturnValue(new URLSearchParams(search));
  const { DemoTimWhiteProfileSurface } = await import(
    '@/features/demo/DemoTimWhiteProfileSurface'
  );

  render(<DemoTimWhiteProfileSurface />);

  return mockStaticArtistPage.mock.calls.at(-1)?.[0] as
    | Record<string, unknown>
    | undefined;
}

describe('DemoTimWhiteProfileSurface', () => {
  beforeEach(() => {
    cleanup();
    mockSearchParams.mockReset();
    mockSearchParams.mockReturnValue(new URLSearchParams());
    mockStaticArtistPage.mockClear();
  });

  it('renders the default clean Tim White profile screenshot surface', async () => {
    const props = await renderSurface();

    expect(props).toMatchObject({
      mode: 'profile',
      artist: expect.objectContaining({
        spotify_id: TIM_WHITE_PROFILE.spotifyArtistId,
        name: TIM_WHITE_PROFILE.name,
        image_url: TIM_WHITE_PROFILE.avatarSrc,
      }),
      hideJovieBranding: true,
      hideMoreMenu: true,
      showFooter: true,
      showPayButton: true,
      showTourButton: true,
    });
  });

  it('accepts subscribe mode from the screenshot route query string', async () => {
    const props = await renderSurface('mode=subscribe');

    expect(props?.mode).toBe('subscribe');
  });

  it('accepts releases mode from the screenshot route query string', async () => {
    const props = await renderSurface('mode=releases');

    expect(props?.mode).toBe('releases');
  });

  it('falls back to profile mode for invalid query string modes', async () => {
    const props = await renderSurface('mode=unknown');

    expect(props?.mode).toBe('profile');
  });
});
