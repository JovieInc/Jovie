import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ShellMetadataChip } from './ShellMetadataChip';

const meta = {
  title: 'Shell/ShellMetadataChip',
  component: ShellMetadataChip,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ShellMetadataChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
