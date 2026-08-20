import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Tooltip } from './Tooltip';

const meta = {
  title: 'Shell/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
  args: {
    children: (
      <Button type='button' variant='secondary'>
        Audience
      </Button>
    ),
    label: 'Open audience',
    defaultOpen: true,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Label: Story = {};

export const Shortcut: Story = {
  args: {
    shortcut: { keys: 'G A', description: 'Open audience' },
  },
};

export const LongLabel: Story = {
  args: {
    label: 'Ask Jovie about audience engagement over the last quarter',
  },
};
