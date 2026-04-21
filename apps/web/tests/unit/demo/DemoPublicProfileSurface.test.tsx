import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStaticArtistPage = vi.hoisted(() => vi.fn());

vi.mock('@/features/profile/StaticArtistPage', () => ({
  StaticArtistPage: (props: unknown) => {
    mockStaticArtistPage(props);
    return <div data-testid='static-artist-page' />;
  },
}));

vi.mock('@/features/demo/DemoClientProviders', () => ({
  DemoClientProviders: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

describe('DemoPublicProfileSurface', () => {
  beforeEach(() => {
    mockStaticArtistPage.mockClear();
  });

  it('passes a Venmo social link to the demo public profile surface', async () => {
    const { DemoPublicProfileSurface } = await import(
      '@/features/demo/DemoPublicProfileSurface'
    );

    render(<DemoPublicProfileSurface />);

    expect(mockStaticArtistPage).toHaveBeenCalledTimes(1);
    expect(mockStaticArtistPage).toHaveBeenCalledWith(
      expect.objectContaining({
        renderMode: 'preview',
        socialLinks: expect.arrayContaining([
          expect.objectContaining({
            platform: 'venmo',
            url: 'https://venmo.com/calvin-demo',
          }),
        ]),
      })
    );
  });
});
