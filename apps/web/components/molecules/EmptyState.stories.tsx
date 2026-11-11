import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AlertTriangle, CalendarDays, Inbox, Lock, Search } from 'lucide-react';
import { EmptyState } from './EmptyState';

const disabledAction: {
  label: string;
  onClick: () => void;
  disabled: boolean;
} = {
  label: 'Preparing…',
  onClick: () => undefined,
  disabled: true,
};

const meta: Meta<typeof EmptyState> = {
  title: 'UI/Molecules/EmptyState',
  component: EmptyState,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    heading: 'No Results Found',
    description: 'Try a different search or clear the current filters.',
    icon: <Search className='h-5 w-5' aria-hidden='true' />,
  },
};

export const Workspace: Story = {
  args: {
    heading: 'No Contacts Yet',
    description: 'Add bookings, management, and press contacts.',
    presentation: 'workspace',
  },
  render: args => (
    <div className='flex h-96 w-[min(40rem,calc(100vw-2rem))] bg-(--app-shell-content-surface)'>
      <EmptyState {...args} />
    </div>
  ),
};

export const DisabledAction: Story = {
  args: {
    heading: 'Preparing Contacts',
  },
  render: () => (
    <EmptyState
      heading='Preparing Contacts'
      description='Your contacts will be ready shortly.'
      action={disabledAction}
    />
  ),
};

export const Quiet: Story = {
  args: {
    heading: 'No pending founder decisions.',
    presentation: 'quiet',
  },
};

// Stories with actions render JSX: Storybook's partial args cannot narrow the
// action/actionSlot union (see DisabledAction).
export const EmptyNoReleases: Story = {
  args: { heading: 'No Releases Yet' },
  render: () => (
    <EmptyState
      heading='No Releases Yet'
      description='Connect Spotify to import your catalog.'
      icon={<Inbox className='h-5 w-5' aria-hidden='true' />}
      action={{ label: 'Connect Spotify', onClick: () => undefined }}
      secondaryAction={{ label: 'Add manually', onClick: () => undefined }}
    />
  ),
};

export const ErrorLoadFailed: Story = {
  args: { heading: 'Could Not Load Releases' },
  render: () => (
    <EmptyState
      variant='error'
      heading='Could Not Load Releases'
      description='Check your connection and try again.'
      icon={<AlertTriangle className='h-5 w-5' aria-hidden='true' />}
      action={{ label: 'Try Again', onClick: () => undefined }}
    />
  ),
};

export const PartialHeadingOnly: Story = {
  args: {
    heading: 'Nothing Here Yet',
  },
};

export const LongContent: Story = {
  args: {
    heading:
      'No Upcoming Shows Across Any Of Your Connected Ticketing Partners',
  },
  render: () => (
    <div className='w-80'>
      <EmptyState
        heading='No Upcoming Shows Across Any Of Your Connected Ticketing Partners'
        description='When Bandsintown, Songkick or your own ticketing links publish a date, it appears here with venue, city and on-sale details so fans can buy tickets straight from your profile.'
        icon={<CalendarDays className='h-5 w-5' aria-hidden='true' />}
        action={{
          label: 'Connect a Ticketing Partner',
          onClick: () => undefined,
          shortcut: 'N then T',
        }}
        secondaryAction={{
          label: 'Learn how tour dates sync',
          href: '/support',
        }}
      />
    </div>
  ),
};

export const PermissionDenied: Story = {
  args: {
    variant: 'permission',
    heading: 'Admins Only',
    description: 'Ask a workspace admin to give you access to billing.',
    icon: <Lock className='h-5 w-5' aria-hidden='true' />,
  },
};

export const Rtl: Story = {
  args: { heading: 'لا توجد إصدارات حتى الآن' },
  render: () => (
    <div dir='rtl' className='w-80'>
      <EmptyState
        heading='لا توجد إصدارات حتى الآن'
        description='اربط حسابك على سبوتيفاي لاستيراد كتالوجك.'
        icon={<Inbox className='h-5 w-5' aria-hidden='true' />}
        action={{
          label: 'ربط سبوتيفاي',
          onClick: () => undefined,
          shortcut: 'N then S',
        }}
      />
    </div>
  ),
};
