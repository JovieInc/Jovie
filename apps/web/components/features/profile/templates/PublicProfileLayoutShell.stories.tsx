import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PublicProfileLayoutShell } from './PublicProfileLayoutShell';

const meta: Meta<typeof PublicProfileLayoutShell> = {
  title: 'Profile/PublicProfileLayoutShell',
  component: PublicProfileLayoutShell,
  // `loading` is not a prop of PublicProfileLayoutShell — the loading
  // hand-off is driven by `desktopSurfaceReady` (JOV-6434): compact stays
  // in the accessibility tree until the desktop surface reports ready, so
  // there is no separate loading state for the story to exercise.
  parameters: {
    layout: 'fullscreen',
    jovie: { uncoveredProps: ['loading'] },
  },
  args: {
    artistName: 'Artist Name',
    heroImageUrl: null,
    heroImageError: false,
    isDesktopLayout: false,
    shouldRenderHeading: true,
    profileAccentStyle: {},
    compactSurface: <div className='p-6'>Compact profile</div>,
    desktopSurface: <div className='p-6'>Desktop profile</div>,
  },
};

export default meta;

export const Compact: StoryObj<typeof PublicProfileLayoutShell> = {};

export const Desktop: StoryObj<typeof PublicProfileLayoutShell> = {
  args: { isDesktopLayout: true, desktopSurfaceReady: true },
};

/** Desktop width before the desktop surface reports ready: the compact
 *  surface stays in place (and in the accessibility tree) until hand-off. */
export const LoadingDesktopHandoff: StoryObj<typeof PublicProfileLayoutShell> =
  {
    args: { isDesktopLayout: true, desktopSurfaceReady: false },
  };

/** An embedded preview: labelled frame with an exit link, and the desktop
 *  slot held by its Loading profile placeholder. */
export const LoadingEmbeddedPreview: StoryObj<typeof PublicProfileLayoutShell> =
  {
    args: { embedded: true, previewExitHref: '/tim' },
  };

/** The opt-out build with no desktop surface and no claim footer: only the
 *  centered compact column. */
export const PartialCompactOnly: StoryObj<typeof PublicProfileLayoutShell> = {
  args: { desktopSurface: null },
};

/** A long artist name and a long claim label below the card. */
export const LongContentClaimFooter: StoryObj<typeof PublicProfileLayoutShell> =
  {
    args: {
      artistName:
        'The Los Angeles After Hours Orchestra and Friends Featuring Everyone',
      heroImageUrl: '/images/avatars/tim-white-founder.jpg',
      isDesktopLayout: true,
      desktopSurfaceReady: true,
      showClaimFooter: true,
      claimFooterHref: '/waitlist?campaign=proof-to-claim',
      claimFooterLabel:
        'Request early access to your own Jovie profile for every release and tour date',
      proofClaim: true,
    },
  };

/** The stage and the claim footer inside a right-to-left page. */
export const Rtl: StoryObj<typeof PublicProfileLayoutShell> = {
  args: {
    artistName: 'منتصف الليل',
    compactSurface: <div className='p-6'>الملف الشخصي</div>,
    showClaimFooter: true,
    claimFooterHref: '/claim',
    claimFooterLabel: 'اطلب الوصول',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
