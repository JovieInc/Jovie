import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerTabbedCard } from './DrawerTabbedCard';

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
