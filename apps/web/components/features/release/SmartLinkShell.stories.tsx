import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SmartLinkShell } from './SmartLinkShell';

const meta = {
  title: 'Release/SmartLinkShell',
  component: SmartLinkShell,
  parameters: {
    layout: 'centered',
    // Smart link pages render the Noir stage; white text tokens assume it.
    themes: { themeOverride: 'dark' },
    backgrounds: { default: 'dark' },
  },
  args: {
    artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    artworkAlt: 'Never Say A Word artwork',
    // Production shells always carry the brand/menu row; keeping it gives
    // the scrollable viewport focusable content (scrollable-region-focusable).
    showMenuButton: true,
    onMenuOpen: () => undefined,
    children: <p>Listen</p>,
  },
} satisfies Meta<typeof SmartLinkShell>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
