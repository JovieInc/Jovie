import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DataCard } from './DataCard';

const meta: Meta<typeof DataCard> = {
  title: 'Molecules/DataCard',
  component: DataCard,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    badgeVariant: {
      control: 'select',
      options: ['default', 'success', 'warning', 'error'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof DataCard>;

export const Default: Story = {
  args: {
    title: 'spotify.com/artist/johndoe',
    subtitle: 'Spotify Artist Profile',
    className: 'w-96',
  },
};

export const WithBadge: Story = {
  args: {
    title: 'instagram.com/johndoe',
    subtitle: 'Instagram Profile',
    badge: 'Active',
    badgeVariant: 'success',
    className: 'w-96',
  },
};

export const WithMetadata: Story = {
  args: {
    title: 'Latest Release',
    subtitle: 'Summer Vibes EP',
    metadata: 'Released on Jan 15, 2024',
    badge: 'New',
    badgeVariant: 'default',
    className: 'w-96',
  },
};

export const WithActions: Story = {
  args: {
    title: 'soundcloud.com/johndoe',
    subtitle: 'SoundCloud Profile',
    badge: 'Pending',
    badgeVariant: 'warning',
    className: 'w-96',
    actions: (
      <Button variant='outline' size='sm'>
        Edit
      </Button>
    ),
  },
};

export const ErrorState: Story = {
  args: {
    title: 'broken-link.com/profile',
    subtitle: 'Link verification failed',
    badge: 'Error',
    badgeVariant: 'error',
    className: 'w-96',
    actions: (
      <Button variant='destructive' size='sm'>
        Remove
      </Button>
    ),
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='space-y-3 w-96'>
      <DataCard
        title='Default Badge'
        subtitle='Standard styling'
        badge='Default'
        badgeVariant='default'
      />
      <DataCard
        title='Success Badge'
        subtitle='Verified and active'
        badge='Active'
        badgeVariant='success'
      />
      <DataCard
        title='Warning Badge'
        subtitle='Needs attention'
        badge='Pending'
        badgeVariant='warning'
      />
      <DataCard
        title='Error Badge'
        subtitle='Action required'
        badge='Failed'
        badgeVariant='error'
      />
    </div>
  ),
};
