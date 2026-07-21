import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InputGroup } from './input-group';
import { Input } from './input';

const meta: Meta<typeof InputGroup> = {
  title: 'UI/Atoms/InputGroup',
  component: InputGroup,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <InputGroup>
      <span className='px-2 text-sm text-secondary-token'>https://</span>
      <Input placeholder='jov.ie/you' className='border-0' />
    </InputGroup>
  ),
};

export const Disabled: Story = {
  render: () => (
    <InputGroup>
      <span className='px-2 text-sm opacity-50'>$</span>
      <Input disabled defaultValue='0.00' className='border-0' />
    </InputGroup>
  ),
};
