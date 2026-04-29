import { describe, expect, it, vi } from 'vitest';
import ArtistProfileAliasPage from '@/app/(marketing)/artist-profile/page';
import NewLandingPage from '@/app/(marketing)/new/page';
import HomeV1Page from '@/app/exp/home-v1/page';
import MarketingSectionsPage from '@/app/exp/marketing-sections/page';
import PageBuilderPage from '@/app/exp/page-builder/page';
import { APP_ROUTES } from '@/constants/routes';

const { permanentRedirectMock } = vi.hoisted(() => ({
  permanentRedirectMock: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('next/navigation', () => ({
  permanentRedirect: permanentRedirectMock,
}));

describe('public marketing route cleanup', () => {
  it('registers retired public route redirects in next config', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const redirects = await nextConfig.redirects();

    expect(redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: APP_ROUTES.LANDING_NEW,
          destination: APP_ROUTES.HOME,
          permanent: true,
        }),
        expect.objectContaining({
          source: '/exp/home-v1',
          destination: `${APP_ROUTES.EXP_DESIGN_STUDIO}?tab=landing`,
          permanent: true,
        }),
        expect.objectContaining({
          source: '/exp/page-builder',
          destination: `${APP_ROUTES.EXP_DESIGN_STUDIO}?tab=landing`,
          permanent: true,
        }),
        expect.objectContaining({
          source: APP_ROUTES.EXP_MARKETING_SECTIONS,
          destination: APP_ROUTES.EXP_DESIGN_STUDIO,
          permanent: true,
        }),
        expect.objectContaining({
          source: '/artist-profile',
          destination: APP_ROUTES.ARTIST_PROFILES,
          permanent: true,
        }),
      ])
    );
  });

  it('redirects the retired /new landing page to the canonical homepage', () => {
    expect(() => NewLandingPage()).toThrow('NEXT_REDIRECT:/');

    expect(permanentRedirectMock).toHaveBeenLastCalledWith(APP_ROUTES.HOME);
  });

  it('redirects retired experiment builders to Design Studio', () => {
    expect(() => HomeV1Page()).toThrow(
      `NEXT_REDIRECT:${APP_ROUTES.EXP_DESIGN_STUDIO}?tab=landing`
    );
    expect(() => PageBuilderPage()).toThrow(
      `NEXT_REDIRECT:${APP_ROUTES.EXP_DESIGN_STUDIO}?tab=landing`
    );
    expect(() => MarketingSectionsPage()).toThrow(
      `NEXT_REDIRECT:${APP_ROUTES.EXP_DESIGN_STUDIO}`
    );
  });

  it('redirects the singular artist profile marketing alias to the plural route', () => {
    expect(() => ArtistProfileAliasPage()).toThrow(
      `NEXT_REDIRECT:${APP_ROUTES.ARTIST_PROFILES}`
    );

    expect(permanentRedirectMock).toHaveBeenLastCalledWith(
      APP_ROUTES.ARTIST_PROFILES
    );
  });
});
