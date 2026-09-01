import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FALLBACK_AVATARS } from './featured-creators-fallback';
import { HomeLiveProofSection } from './HomeLiveProofSection';

const meta = {
  title: 'Marketing/Sections/HomeLiveProofSection',
  component: HomeLiveProofSection,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    creators: FALLBACK_AVATARS,
  },
} satisfies Meta<typeof HomeLiveProofSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
