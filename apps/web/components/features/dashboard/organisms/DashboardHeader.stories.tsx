import '../../../../styles/system-b-app.css';
import { Button, CommonDropdown, TitleMenuTrigger } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PanelRight, Pin } from 'lucide-react';
import { useState } from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { DashboardHeaderActionButton } from '../atoms/DashboardHeaderActionButton';
import { DashboardHeader } from './DashboardHeader';

const meta = {
  title: 'Features/Dashboard/Organisms/DashboardHeader',
  component: DashboardHeader,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: ['breadcrumbs'],
    },
  },
  args: {
    breadcrumbs: [{ label: 'New Chat', href: '/app/chat' }],
  },
  decorators: [
    Story => (
      <div className='bg-base'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DashboardHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewChat: Story = {};

export const TransparentChat: Story = {
  args: {
    breadcrumbs: [{ label: 'New Chat', href: '/app/chat' }],
    transparent: true,
    searchSurface: (
      <Button
        type='button'
        variant='ghost'
        size='sm'
        className='h-auto rounded-full px-0 py-0 text-xs text-secondary-token before:hidden'
      >
        Search chats
      </Button>
    ),
  },
};

/** Breadcrumb trail with none of the optional slots filled. */
export const PartialNoSlots: Story = {
  args: {
    breadcrumbs: [
      { label: 'Jovie', href: '/app' },
      { label: 'Releases', href: '/app/releases' },
    ],
  },
};

/** A long chat title truncates on one line beside the rail slot and action. */
export const LongContentTitle: Story = {
  args: {
    breadcrumbs: [
      { label: 'Jovie', href: '/app' },
      {
        label:
          'Plan the full European summer festival run including travel, merch restocks and every press interview request',
        href: '/app/chat/long',
      },
    ],
    action: (
      <Button type='button' variant='ghost' size='sm'>
        Share
      </Button>
    ),
  },
  decorators: [
    Story => (
      <div className='w-105 max-w-full'>
        <Story />
      </div>
    ),
  ],
};

export const RtlTitle: Story = {
  args: {
    breadcrumbs: [
      { label: 'جوفي', href: '/app' },
      { label: 'خطة جولة المهرجانات الصيفية في أوروبا', href: '/app/chat/rtl' },
    ],
    action: (
      <Button type='button' variant='ghost' size='sm'>
        مشاركة
      </Button>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};

function HeaderControls({ menu = false }: { readonly menu?: boolean }) {
  const [railOpen, setRailOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [title, setTitle] = useState('New Chat');
  return (
    <DashboardHeader
      breadcrumbs={[{ label: menu ? title : 'Views' }]}
      breadcrumbSuffix={
        menu ? (
          <CommonDropdown
            align='start'
            trigger={<TitleMenuTrigger label={title} />}
            items={[
              {
                id: 'tour',
                type: 'action',
                label: 'Plan The Autumn Tour',
                onClick: () => setTitle('Plan The Autumn Tour'),
              },
            ]}
          />
        ) : undefined
      }
      railToggle={
        <AppIconButton
          ariaLabel='Toggle Details'
          aria-pressed={railOpen}
          onClick={() => setRailOpen(open => !open)}
        >
          <PanelRight />
        </AppIconButton>
      }
      action={
        <DashboardHeaderActionButton
          ariaLabel='Pin View'
          label='Pin View'
          icon={<Pin />}
          pressed={pinned}
          onClick={() => setPinned(value => !value)}
        />
      }
    />
  );
}

/** Shared controls keep the same geometry through hover, focus and selection. */
export const WithControls: Story = {
  render: () => <HeaderControls />,
};

/** The same title atom used by ChatHistorySwitcher, within the real header. */
export const WithTitleMenu: Story = {
  render: () => <HeaderControls menu />,
};
