import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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
      <div className='w-105'>
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
