import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeTrustSection } from './HomeTrustSection';

const meta = {
  title: 'Marketing/Sections/HomeTrustSection',
  component: HomeTrustSection,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component:
          'Canonical trust-logo owner across the homepage and artist-profile presentations. Route wrappers retain their own placement and copy.',
      },
    },
  },
} satisfies Meta<typeof HomeTrustSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Card: Story = {};

export const InlineStrip: Story = {
  args: { presentation: 'inline-strip' },
};

export const ArtistProfile: Story = {
  args: { presentation: 'artist-profile' },
};
