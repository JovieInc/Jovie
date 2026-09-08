import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SocialProofSection } from './SocialProofSection';

const meta = {
  title: 'Marketing/SocialProofSection',
  component: SocialProofSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof SocialProofSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
