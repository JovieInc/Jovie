import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PublicProfileLayoutShell } from './PublicProfileLayoutShell';

const meta: Meta<typeof PublicProfileLayoutShell> = {
  title: 'Profile/PublicProfileLayoutShell',
  component: PublicProfileLayoutShell,
  parameters: { layout: 'fullscreen' },
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
  args: { isDesktopLayout: true },
};
