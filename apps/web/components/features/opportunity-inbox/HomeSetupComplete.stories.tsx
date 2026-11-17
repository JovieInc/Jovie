import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeSetupComplete } from './HomeSetupComplete';

const meta = {
  title: 'Dashboard/Opportunity Inbox/Home Setup Complete',
  component: HomeSetupComplete,
  parameters: { layout: 'fullscreen' },
  args: {
    steps: [
      { label: 'Complete Your Profile', description: '', complete: true },
      { label: 'Connect Your Music', description: '', complete: true },
      { label: 'Add Your Links', description: '', complete: true },
    ],
  },
  render: args => (
    <div className='min-h-screen bg-(--app-shell-content-surface) px-3 py-5'>
      <HomeSetupComplete {...args} />
    </div>
  ),
} satisfies Meta<typeof HomeSetupComplete>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
