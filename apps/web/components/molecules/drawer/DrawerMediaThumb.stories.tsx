import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerMediaThumb } from './DrawerMediaThumb';

const meta = {
  title: 'Molecules/Drawer/DrawerMediaThumb',
  component: DrawerMediaThumb,
  parameters: { layout: 'centered' },
  args: {
    src: null,
    alt: 'Artist profile',
    fallback: <span className='text-sm text-secondary-token'>AR</span>,
    dimension: 48,
    sizes: '48px',
    sizeClassName: 'size-12',
  },
} satisfies Meta<typeof DrawerMediaThumb>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fallback: Story = {};

export const WithImage: Story = {
  args: { src: '/avatars/default-user.png' },
};
