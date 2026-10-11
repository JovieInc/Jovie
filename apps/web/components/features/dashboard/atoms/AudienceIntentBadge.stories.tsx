import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceIntentBadge } from './AudienceIntentBadge';

const meta = {
  title: 'Dashboard/Atoms/AudienceIntentBadge',
  component: AudienceIntentBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    intentLevel: 'high',
  },
  argTypes: {
    intentLevel: {
      control: 'select',
      options: ['high', 'medium', 'low'],
    },
  },
} satisfies Meta<typeof AudienceIntentBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const High: Story = {};

export const Medium: Story = {
  args: { intentLevel: 'medium' },
};

export const Low: Story = {
  args: { intentLevel: 'low' },
};

export const AllLevels: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <AudienceIntentBadge intentLevel='high' />
      <AudienceIntentBadge intentLevel='medium' />
      <AudienceIntentBadge intentLevel='low' />
    </div>
  ),
};
