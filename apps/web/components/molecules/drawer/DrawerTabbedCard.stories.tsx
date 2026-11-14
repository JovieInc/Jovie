import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerTabbedCard } from './DrawerTabbedCard';

const ACTIVITY_ROWS = Array.from(
  { length: 24 },
  (_, index) => `Activity ${index + 1}: smart link updated with new store pages`
);

const meta = {
  title: 'Molecules/Drawer/DrawerTabbedCard',
  component: DrawerTabbedCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='h-72 w-80'>
        <Story />
      </div>
    ),
  ],
  args: {
    tabs: <div className='text-xs text-primary-token'>Details · Activity</div>,
    children: <p className='text-sm text-secondary-token'>Entity details</p>,
  },
} satisfies Meta<typeof DrawerTabbedCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Card: Story = {};

export const Flat: Story = {
  args: {
    surfaceVariant: 'flat',
  },
};

/** The active tab has nothing to show yet. */
export const EmptyTab: Story = {
  args: {
    children: <p className='text-xs text-tertiary-token'>No activity yet.</p>,
  },
};

/** Many rows overflow into the internal scroll region; the tabs stay put. */
export const LongContent: Story = {
  args: {
    tabs: (
      <div className='truncate text-xs text-primary-token'>
        Release details · Activity history · Distribution and territories
      </div>
    ),
    children: (
      <ul className='space-y-2 text-sm text-secondary-token'>
        {ACTIVITY_ROWS.map(row => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    ),
  },
};

export const Rtl: Story = {
  args: {
    tabs: <div className='text-xs text-primary-token'>التفاصيل · النشاط</div>,
    children: <p className='text-sm text-secondary-token'>تفاصيل العنصر</p>,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='h-72 w-80'>
        <Story />
      </div>
    ),
  ],
};
