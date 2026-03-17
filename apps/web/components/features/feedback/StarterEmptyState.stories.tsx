import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Link as LinkIcon, Music } from 'lucide-react';
import { APP_ROUTES } from '@/constants/routes';
import { StarterEmptyState } from './StarterEmptyState';

const meta: Meta<typeof StarterEmptyState> = {
  title: 'Feedback/StarterEmptyState',
  component: StarterEmptyState,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof StarterEmptyState>;

export const Default: Story = {
  args: {
    title: 'Get started with Jovie',
    description: 'Create your artist profile and start connecting with fans.',
    primaryAction: {
      label: 'Create Profile',
      onClick: () => console.log('Create profile'),
    },
    className: 'w-96',
  },
};

export const WithSecondaryAction: Story = {
  args: {
    title: 'No links added yet',
    description: 'Add your first link to start building your profile.',
    primaryAction: {
      label: 'Add Link',
      onClick: () => console.log('Add link'),
    },
    secondaryAction: {
      label: 'Learn More',
      href: '/help',
    },
    className: 'w-96',
  },
};

export const CustomIcon: Story = {
  args: {
    title: 'Add your music',
    description: 'Connect your Spotify, Apple Music, or SoundCloud.',
    icon: <Music className='h-6 w-6' />,
    primaryAction: {
      label: 'Add Music Link',
      onClick: () => console.log('Add music'),
    },
    className: 'w-96',
  },
};

export const LinksEmpty: Story = {
  args: {
    title: 'Your links will appear here',
    description: 'Add social media, music platforms, and more.',
    icon: <LinkIcon className='h-6 w-6' />,
    primaryAction: {
      label: 'Add First Link',
      href: APP_ROUTES.DASHBOARD_PROFILE,
    },
    className: 'w-96',
  },
};

export const NoActions: Story = {
  args: {
    title: 'Coming soon',
    description: 'This feature is currently in development.',
    className: 'w-96',
  },
};

export const InDashboard: Story = {
  render: () => (
    <div className='w-[500px] p-6 border border-subtle rounded-xl bg-surface'>
      <h2 className='text-lg font-semibold mb-4'>Your Links</h2>
      <StarterEmptyState
        title='No links yet'
        description='Add your first link to start building your profile.'
        primaryAction={{
          label: 'Add Link',
          onClick: () => console.log('Add link'),
        }}
        secondaryAction={{
          label: 'Import from Linktree',
          onClick: () => console.log('Import'),
          variant: 'secondary',
        }}
      />
    </div>
  ),
};
