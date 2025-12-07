import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EmptyState } from './EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'Organisms/EmptyState',
  component: EmptyState,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    type: {
      control: 'select',
      options: ['music', 'social', 'links', 'analytics', 'general'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Music: Story = {
  args: {
    type: 'music',
    onAction: () => console.log('Add music link'),
    className: 'w-96',
  },
};

export const Social: Story = {
  args: {
    type: 'social',
    onAction: () => console.log('Add social link'),
    className: 'w-96',
  },
};

export const Links: Story = {
  args: {
    type: 'links',
    onAction: () => console.log('Add link'),
    className: 'w-96',
  },
};

export const Analytics: Story = {
  args: {
    type: 'analytics',
    onAction: () => console.log('Copy profile link'),
    className: 'w-96',
  },
};

export const General: Story = {
  args: {
    type: 'general',
    onAction: () => console.log('Get started'),
    className: 'w-96',
  },
};

export const CustomContent: Story = {
  args: {
    type: 'music',
    title: 'No tracks found',
    description:
      'Upload your first track to get started with your music profile.',
    actionLabel: 'Upload Track',
    onAction: () => console.log('Upload track'),
    className: 'w-96',
  },
};

export const WithoutAction: Story = {
  args: {
    type: 'analytics',
    title: 'No data available',
    description:
      'Analytics will appear here once you start getting profile views.',
    className: 'w-96',
  },
};

export const AllTypes: Story = {
  render: () => (
    <div className='grid grid-cols-2 gap-4 w-[800px]'>
      <EmptyState type='music' onAction={() => {}} />
      <EmptyState type='social' onAction={() => {}} />
      <EmptyState type='links' onAction={() => {}} />
      <EmptyState type='analytics' onAction={() => {}} />
    </div>
  ),
};
