import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { IdentityCell } from './IdentityCell';

const meta = {
  title: 'Design System/Data Grid/Cells/IdentityCell',
  component: IdentityCell,
  parameters: { layout: 'centered' },
  args: { name: 'Sasha Fan', secondary: 'sasha@example.com' },
} satisfies Meta<typeof IdentityCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
