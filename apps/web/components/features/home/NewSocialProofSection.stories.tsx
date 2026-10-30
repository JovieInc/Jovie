import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NewSocialProofSection } from './NewSocialProofSection';

const meta = {
  title: 'Marketing/NewSocialProofSection',
  component: NewSocialProofSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof NewSocialProofSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
