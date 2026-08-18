import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Input } from './input';
import { InputGroup } from './input-group';

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
    <InputGroup className='w-72'>
      <span data-slot='icon' aria-hidden='true'>
        @
      </span>
      <Input aria-label='Profile handle' placeholder='artist' />
    </InputGroup>
  ),
};

export const Disabled: Story = {
  render: () => (
    <InputGroup className='w-72'>
      <span data-slot='icon' aria-hidden='true'>
        $
      </span>
      <Input aria-label='Balance' disabled defaultValue='0.00' />
    </InputGroup>
  ),
};

export const LeadingAndTrailing: Story = {
  render: () => (
    <InputGroup className='w-72' size='lg'>
      <span data-slot='icon' aria-hidden='true'>
        ?
      </span>
      <Input
        aria-label='Search creators'
        placeholder='Search creators'
        size='lg'
      />
      <span data-slot='icon' aria-hidden='true'>
        /
      </span>
    </InputGroup>
  ),
};
