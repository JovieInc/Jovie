import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { VerifiedBadge } from './VerifiedBadge';

const meta = {
  title: 'Atoms/VerifiedBadge',
  component: VerifiedBadge,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof VerifiedBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className='flex items-center gap-3'>
      <VerifiedBadge size='sm' />
      <VerifiedBadge size='md' />
      <VerifiedBadge size='lg' />
    </div>
  ),
};

/** The badge trails a long artist name that wraps, staying inline at the end. */
export const LongContentArtistName: Story = {
  render: () => (
    <p className='w-56 text-lg font-semibold text-primary-token'>
      Timothy White and the Very Long Sibling Ensemble Collective{' '}
      <VerifiedBadge size='sm' />
    </p>
  ),
};

/** Right-to-left: the badge follows an Arabic artist name at the inline end. */
export const Rtl: Story = {
  render: () => (
    <p dir='rtl' className='w-56 text-lg font-semibold text-primary-token'>
      فرقة الأصوات العربية المستقلة <VerifiedBadge size='sm' />
    </p>
  ),
};
