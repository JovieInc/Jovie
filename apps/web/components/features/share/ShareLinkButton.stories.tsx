import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ShareLinkButton } from './ShareLinkButton';

const meta = {
  title: 'Features/Share/ShareLinkButton',
  component: ShareLinkButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'Tim White',
    getUrl: () => 'https://jov.ie/tim',
    ariaLabel: 'Share Tim White\x27s profile',
  },
} satisfies Meta<typeof ShareLinkButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Surface: Story = {
  args: {
    variant: 'surface',
  },
};
