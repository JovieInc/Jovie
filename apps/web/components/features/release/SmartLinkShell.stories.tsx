import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SmartLinkShell } from './SmartLinkShell';

const meta = {
  title: 'Release/SmartLinkShell',
  component: SmartLinkShell,
  parameters: { layout: 'centered' },
  args: {
    artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    artworkAlt: 'Never Say A Word artwork',
    showMenuButton: false,
    children: <p>Listen</p>,
  },
} satisfies Meta<typeof SmartLinkShell>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
