import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import { SimpleTooltip } from './simple-tooltip';

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
    <SimpleTooltip content='Save changes' contentVariant='compact'>
      <Button variant='secondary'>Hover me</Button>
    </SimpleTooltip>
  ),
};

export const CompactAndRich: Story = {
  render: () => (
    <div className='flex items-center gap-6'>
      <SimpleTooltip content='Copy link' contentVariant='compact' defaultOpen>
        <Button variant='secondary'>Compact label</Button>
      </SimpleTooltip>
      <SimpleTooltip
        content='Copies the public profile URL so you can share it anywhere.'
        contentVariant='rich'
        defaultOpen
        side='bottom'
        showArrow
      >
        <Button variant='secondary'>Rich explanation</Button>
      </SimpleTooltip>
    </div>
  ),
};

export const LongContent: Story = {
  render: () => (
    <SimpleTooltip content='A longer tooltip that explains the action in more detail for assistive context.'>
      <Button variant='ghost'>Details</Button>
    </SimpleTooltip>
  ),
};
