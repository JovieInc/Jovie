import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FormatHints } from './FormatHints';

const meta = {
  title: 'Organisms/SmartHandleInput/FormatHints',
  component: FormatHints,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof FormatHints>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
