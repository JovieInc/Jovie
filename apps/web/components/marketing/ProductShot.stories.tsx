import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProductShot } from './ProductShot';

const meta = {
  title: 'Marketing/ProductShot',
  component: ProductShot,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    Story => (
      <div style={{ width: 'min(52rem, 92vw)' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    id: 'setup-claim-handle',
  },
} satisfies Meta<typeof ProductShot>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bare frame: a tight crop of one onboarding step. */
export const ClaimHandle: Story = {};

export const ConnectMusic: Story = {
  args: { id: 'setup-connect-music' },
};

export const ShareProfile: Story = {
  args: { id: 'setup-share-profile' },
};

/** Desktop profile cropped to identity and the featured release. */
export const ProfileHeroDesktop: Story = {
  args: { id: 'profile-hero-desktop', priority: true },
};
