import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OperatorBanner } from './OperatorBanner';

const meta = {
  title: 'Features/Admin/OperatorBanner',
  component: OperatorBanner,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof OperatorBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnvironmentIssues: Story = {
  args: {
    initialIssues: ['DATABASE_URL is not set', 'CLERK_SECRET_KEY is missing'],
  },
};
