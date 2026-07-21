import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SimpleTooltip } from './simple-tooltip';
import { Button } from './button';

const meta: Meta<typeof SimpleTooltip> = {
  title: 'UI/Atoms/SimpleTooltip',
  component: SimpleTooltip,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <SimpleTooltip content='Save changes'>
      <Button variant='secondary'>Hover me</Button>
    </SimpleTooltip>
  ),
};

export const LongContent: Story = {
  render: () => (
    <SimpleTooltip content='A longer tooltip that explains the action in more detail for assistive context.'>
      <Button variant='ghost'>Details</Button>
    </SimpleTooltip>
  ),
};
