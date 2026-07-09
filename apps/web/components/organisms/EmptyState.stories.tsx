import type { Meta, StoryObj } from '@storybook/react';
import { BarChart3, Link as LinkIcon, Lock, Search, Users } from 'lucide-react';
import {
  EmptyState,
  type EmptyStateProps,
} from '@/components/molecules/EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'UI/EmptyState',
  component: EmptyState,
  args: {
    heading: 'Nothing Here Yet',
    description: 'Add your first item to see data and helpful insights.',
    icon: <LinkIcon className='h-5 w-5' aria-hidden='true' />,
  },
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {};

export const WithPrimaryAction: Story = {
  args: {
    heading: 'No Links Yet',
    description: 'Add your first link to start sharing your profile.',
    icon: <LinkIcon className='h-5 w-5' aria-hidden='true' />,
    action: {
      label: 'Add Link',
      onClick: () => {
        console.log('Add Link clicked');
      },
    },
    secondaryAction: {
      label: 'Learn About Links',
      href: '/support',
    },
  },
};

export const SearchVariant: Story = {
  args: {
    variant: 'search',
    heading: 'No Results Found',
    description: 'Try different keywords or clear the current filters.',
    icon: <Search className='h-5 w-5' aria-hidden='true' />,
    action: {
      label: 'Clear Search',
      onClick: () => console.log('Search cleared'),
      variant: 'secondary',
    },
  },
};

export const ErrorState: Story = {
  args: {
    variant: 'error',
    heading: 'Something Went Wrong',
    description: 'Please try again or contact support if the issue persists.',
    icon: <BarChart3 className='h-5 w-5' aria-hidden='true' />,
    action: {
      label: 'Retry',
      onClick: () => console.log('Retry clicked'),
    },
    secondaryAction: {
      label: 'Contact Support',
      href: '/support',
    },
  },
};

export const PermissionState: Story = {
  args: {
    variant: 'permission',
    heading: 'You Need Additional Access',
    description:
      'Your current plan does not include this dashboard. Ask a workspace admin to grant access.',
    icon: <Lock className='h-5 w-5' aria-hidden='true' />,
    action: {
      label: 'Request Access',
      onClick: () => console.log('Request access'),
    },
  },
};

export const Gallery: Story = {
  render: (args: EmptyStateProps) => (
    <div className='grid gap-8 md:grid-cols-2'>
      <EmptyState
        {...args}
        heading='Invite Your First Audience Member'
        description="Share your profile link to see who's visiting and subscribing."
        icon={<Users className='h-5 w-5' aria-hidden='true' />}
        action={{
          label: 'Copy Profile Link',
          onClick: () => console.log('Profile link copied'),
        }}
      />
      <EmptyState
        {...args}
        variant='search'
        heading='No Analytics Yet'
        description='Once fans visit your profile, engagement data will appear here.'
        icon={<BarChart3 className='h-5 w-5' aria-hidden='true' />}
        secondaryAction={{
          label: 'View Docs',
          href: 'https://docs.jov.ie',
        }}
      />
    </div>
  ),
};
