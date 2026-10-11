import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerStatGrid } from './DrawerStatGrid';
import { StatTile } from './StatTile';

const meta = {
  title: 'Molecules/Drawer/DrawerStatGrid',
  component: DrawerStatGrid,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-surface-0'>
        <Story />
      </div>
    ),
  ],
  args: {
    children: (
      <>
        <StatTile label='Views' value='12.4k' hint='+8% vs last week' />
        <StatTile label='Clicks' value='3,204' hint='+2% vs last week' />
      </>
    ),
  },
} satisfies Meta<typeof DrawerStatGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Flush: Story = {};

export const Card: Story = {
  args: {
    variant: 'card',
  },
};
