import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { HeaderIconButton } from './HeaderIconButton';

const PlaceholderIcon = () => (
  <svg
    aria-hidden='true'
    viewBox='0 0 16 16'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.5'
    className='h-4 w-4'
  >
    <path d='M5 3l5 5-5 5' />
  </svg>
);

/** Rendered states of the header icon action, beside HeaderIconButton.stories.tsx. */
const meta = {
  title: 'Atoms/HeaderIconButton States',
  component: HeaderIconButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    ariaLabel: 'Header action',
    children: <PlaceholderIcon />,
    onClick: fn(),
  },
} satisfies Meta<typeof HeaderIconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long accessible name keeps the square icon footprint. */
export const LongContentAccessibleName: Story = {
  args: {
    ariaLabel:
      'Open the release plan sidebar with every task, pitch and asset for this drop',
  },
};

/** Right-to-left: an Arabic name in a right-to-left header row. */
export const RtlArabicHeader: Story = {
  args: {
    ariaLabel: 'فتح القائمة',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='flex items-center gap-2'>
        <span className='text-sm text-primary-token'>الإصدارات</span>
        <Story />
      </div>
    ),
  ],
};
