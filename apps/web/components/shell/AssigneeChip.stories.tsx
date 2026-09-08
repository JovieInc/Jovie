import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AssigneeChip } from './AssigneeChip';

const meta = {
  title: 'Shell/AssigneeChip',
  component: AssigneeChip,
  parameters: {
    layout: 'centered',
  },
  args: {
    kind: 'jovie',
  },
} satisfies Meta<typeof AssigneeChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const JovieCompact: Story = {};

export const JovieExpanded: Story = {
  args: {
    kind: 'jovie',
    expanded: true,
  },
};

export const HumanExpanded: Story = {
  args: {
    kind: 'human',
    name: 'Tim',
    expanded: true,
    avatar: <span aria-hidden>TW</span>,
  },
};
