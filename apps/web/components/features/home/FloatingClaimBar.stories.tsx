import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FloatingClaimBar } from './FloatingClaimBar';

const meta = {
  title: 'Marketing/Sections/FloatingClaimBar',
  component: FloatingClaimBar,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FloatingClaimBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
