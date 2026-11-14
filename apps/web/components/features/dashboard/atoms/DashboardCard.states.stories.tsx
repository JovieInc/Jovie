import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardCard } from './DashboardCard';

/**
 * State coverage for DashboardCard. The card is a layout surface, so each
 * state changes only the caller-owned children or the document direction.
 */
const meta: Meta<typeof DashboardCard> = {
  title: 'Dashboard/Atoms/DashboardCard States',
  component: DashboardCard,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof DashboardCard>;

/** Long content: a long heading and paragraph wrap inside the card width. */
export const LongContentWrapping: Story = {
  args: {
    variant: 'default',
    className: 'w-80',
    children: (
      <div>
        <h3 className='mb-2 font-semibold'>
          Release-day checklist for every connected streaming platform
        </h3>
        <p className='text-sm text-secondary-token'>
          This deliberately long card body runs to several lines so the card can
          be checked for clean wrapping without clipping or horizontal overflow
          at narrow widths. Supercalifragilisticexpialidocious.
        </p>
      </div>
    ),
  },
};

/** Long content on the interactive variant, rendered as a button. */
export const LongContentInteractive: Story = {
  args: {
    variant: 'interactive',
    className: 'w-80 text-start',
    onClick: () => {},
    children: (
      <span>
        Open the full analytics breakdown for this release across every platform
        and region
      </span>
    ),
  },
};

/** Right-to-left: the card inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    variant: 'default',
    className: 'w-80',
    children: (
      <div>
        <h3 className='mb-2 font-semibold'>عنوان البطاقة</h3>
        <p className='text-sm text-secondary-token'>
          هذه بطاقة لوحة تحكم افتراضية.
        </p>
      </div>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
