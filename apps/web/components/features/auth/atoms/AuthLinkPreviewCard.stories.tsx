import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { AuthLinkPreviewCard } from './AuthLinkPreviewCard';

const meta = {
  title: 'Features/Auth/AuthLinkPreviewCard',
  component: AuthLinkPreviewCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    label: 'Your profile is live at',
    hrefText: TIM_WHITE_PROFILE.publicProfileDisplay,
  },
} satisfies Meta<typeof AuthLinkPreviewCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
