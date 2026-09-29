import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CopyableField } from './CopyableField';

const meta = {
  title: 'Features/Ui/CopyableField',
  component: CopyableField,
  parameters: {
    layout: 'centered',
  },
  args: {
    value: 'tim@jovie.com',
    label: 'Email',
  },
} satisfies Meta<typeof CopyableField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomContent: Story = {
  args: {
    value: 'USQX52000123',
    label: 'ISRC',
    children: <code>USQX52000123</code>,
  },
};
