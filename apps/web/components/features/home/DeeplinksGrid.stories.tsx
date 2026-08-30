import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DeeplinksGrid } from './DeeplinksGrid';

const meta = {
  title: 'Marketing/Sections/DeeplinksGrid',
  component: DeeplinksGrid,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DeeplinksGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
