import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatusBadge } from './StatusBadge';

const DotIcon = () => (
  <svg
    aria-hidden='true'
    viewBox='0 0 16 16'
    fill='currentColor'
    className='h-3.5 w-3.5'
  >
    <circle cx='8' cy='8' r='4' />
  </svg>
);

/** Rendered states of the status badge, beside StatusBadge.stories.tsx. */
const meta = {
  title: 'Atoms/StatusBadge States',
  component: StatusBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: 'Active',
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the red tone announcing a failed sync as live status. */
export const ErrorSyncFailed: Story = {
  args: {
    variant: 'red',
    dynamic: true,
    icon: <DotIcon />,
    children: 'Sync failed',
  },
};

/** Partial: text only, with the default tone, size and no icon. */
export const PartialTextOnly: Story = {
  args: {
    children: 'Queued',
  },
};

/** Long content: a long status truncates inside a narrow cell. */
export const LongContentStatus: Story = {
  args: {
    variant: 'orange',
    icon: <DotIcon />,
    children: 'Waiting on distributor approval for every territory',
  },
  decorators: [
    Story => (
      <div className='w-48'>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: an Arabic status keeps its icon at the reading start. */
export const RtlArabicStatus: Story = {
  args: {
    variant: 'green',
    icon: <DotIcon />,
    children: 'مباشر',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
