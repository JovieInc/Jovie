import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import PayPromo from './PayPromo';

const meta = {
  title: 'Organisms/PayPromo',
  component: PayPromo,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof PayPromo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
