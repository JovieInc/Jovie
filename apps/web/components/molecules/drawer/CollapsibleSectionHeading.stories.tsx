import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CollapsibleSectionHeading } from './CollapsibleSectionHeading';

const meta = {
  title: 'Molecules/Drawer/CollapsibleSectionHeading',
  component: CollapsibleSectionHeading,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-sm text-primary-token'>{Story()}</div>
    ),
  ],
  args: {
    isOpen: true,
    onToggle: () => undefined,
    children: 'Audience details',
    'aria-controls': 'audience-details',
  },
} satisfies Meta<typeof CollapsibleSectionHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Collapsed: Story = {
  args: {
    isOpen: false,
  },
};

export const WithCustomContent: Story = {
  args: {
    children: (
      <span className='flex items-center gap-2'>
        <span aria-hidden='true' className='size-1.5 rounded-full bg-success' />
        Connected audience
      </span>
    ),
  },
};
