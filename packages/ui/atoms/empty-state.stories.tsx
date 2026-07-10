import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EmptyState } from './empty-state';

const meta: Meta<typeof EmptyState> = {
  title: 'UI/Atoms/EmptyState',
  component: EmptyState,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Canonical EmptyState primitive — centered vertically and horizontally. No icon-in-box hero (banned pattern).',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    heading: { control: 'text' },
    description: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    heading: 'No items yet',
    description: 'Items you add will appear here.',
  },
  decorators: [
    Story => (
      <div className='flex h-64 w-full max-w-md'>
        <Story />
      </div>
    ),
  ],
};

export const WithPrimaryAction: Story = {
  args: {
    heading: 'No links yet',
    description: 'Add your first link to get started.',
    primaryAction: {
      label: 'Add Link',
      onClick: () => {},
    },
  },
  decorators: [
    Story => (
      <div className='flex h-64 w-full max-w-md'>
        <Story />
      </div>
    ),
  ],
};

export const WithActions: Story = {
  args: {
    heading: 'Grow Your Audience',
    description: 'Share your profile link on social media to invite visitors.',
    primaryAction: {
      label: 'Copy profile link',
      onClick: () => {},
    },
    secondaryAction: {
      label: 'Learn more',
      href: '/support',
    },
  },
  decorators: [
    Story => (
      <div className='flex h-64 w-full max-w-md'>
        <Story />
      </div>
    ),
  ],
};
