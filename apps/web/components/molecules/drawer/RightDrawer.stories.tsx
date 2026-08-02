import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RightDrawer } from './RightDrawer';

const meta: Meta<typeof RightDrawer> = {
  title: 'Molecules/Drawer/RightDrawer',
  component: RightDrawer,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    isOpen: true,
    width: 360,
    ariaLabel: 'Entity details',
    children: <div className='p-4'>Inspector content</div>,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Closed: Story = {
  args: {
    isOpen: false,
  },
};
