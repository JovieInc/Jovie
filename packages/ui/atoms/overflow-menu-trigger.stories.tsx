import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OverflowMenuTrigger } from './overflow-menu-trigger';

const meta: Meta<typeof OverflowMenuTrigger> = {
  title: 'UI/Atoms/OverflowMenuTrigger',
  component: OverflowMenuTrigger,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { 'aria-label': 'More actions' },
};

export const ActiveOverflow: Story = {
  args: { 'aria-label': 'More actions', hasActiveOverflow: true },
};

export const BlankLabel: Story = {
  args: { 'aria-label': '' },
};

export const ActiveOverflowBlankLabel: Story = {
  args: { 'aria-label': '   ', hasActiveOverflow: true },
};

export const MenuOpen: Story = {
  args: {
    'aria-label': 'More actions',
    'data-state': 'open',
    hasActiveOverflow: true,
  },
};

export const Disabled: Story = {
  args: { 'aria-label': 'More actions', disabled: true },
};

export const VariantMatrix: Story = {
  render: () => (
    <div className='flex items-center gap-6'>
      <div className='flex flex-col items-center gap-2'>
        <OverflowMenuTrigger variant='drawer' aria-label='Drawer overflow' />
        <span className='text-xs text-tertiary-token'>Drawer</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <OverflowMenuTrigger
          variant='segment'
          hasActiveOverflow
          aria-label='Segment overflow, current tab hidden'
        />
        <span className='text-xs text-tertiary-token'>Active segment</span>
      </div>
    </div>
  ),
};

export const Partial: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story:
          'Every optional prop omitted: the trigger falls back to the "More tabs" accessible name and the drawer context.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <div className='flex w-64 min-w-0 items-center gap-1 rounded-(--system-b-radius-panel-inner) border border-subtle bg-surface-1 p-1'>
      <span className='min-w-0 flex-1 truncate px-2 text-sm text-secondary-token'>
        Release analytics for every territory and platform
      </span>
      <span className='min-w-0 flex-1 truncate px-2 text-sm text-secondary-token'>
        Audience growth across smart links and playlists
      </span>
      <OverflowMenuTrigger
        hasActiveOverflow
        aria-label='More tabs, current tab hidden: Release analytics for every territory and platform'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Next to long tab labels in a narrow bar, the labels truncate while the trigger keeps its fixed size; a long accessible name never changes its geometry.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div
      dir='rtl'
      className='flex w-64 min-w-0 items-center gap-1 rounded-(--system-b-radius-panel-inner) border border-subtle bg-surface-1 p-1'
    >
      <span className='min-w-0 flex-1 truncate px-2 text-sm text-secondary-token'>
        إحصائيات الإصدار لجميع الدول والمنصات
      </span>
      <span className='min-w-0 flex-1 truncate px-2 text-sm text-secondary-token'>
        نمو الجمهور عبر الروابط الذكية
      </span>
      <OverflowMenuTrigger
        hasActiveOverflow
        aria-label='المزيد من علامات التبويب، علامة التبويب الحالية مخفية'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'In a right-to-left tab bar the trigger sits at the inline end after the truncated Arabic labels and keeps its fixed size and Arabic accessible name.',
      },
    },
  },
};
