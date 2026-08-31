import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MobileProfileDrawer } from './MobileProfileDrawer';

const meta = {
  title: 'Features/Dashboard/Organisms/MobileProfileDrawer',
  component: MobileProfileDrawer,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['onOpen'],
    },
  },
} satisfies Meta<typeof MobileProfileDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
