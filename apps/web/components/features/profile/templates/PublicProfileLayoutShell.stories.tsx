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
