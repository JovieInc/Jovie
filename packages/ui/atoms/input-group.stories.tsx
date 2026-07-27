import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Eye, Lock, Mail, Search } from 'lucide-react';
import { Input } from './input';
import { InputGroup } from './input-group';

const meta: Meta<typeof InputGroup> = {
  title: 'shadcn/InputGroup',
  component: InputGroup,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Wraps an Input with leading/trailing icon slots. Icons need `data-slot="icon"` for positioning; the wrapper adjusts input padding automatically.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
      description: 'Size variant to match Input size',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Icon Positions
export const LeadingIcon: Story = {
  render: () => (
    <div className='w-80'>
      <InputGroup>
        <Search data-slot='icon' aria-hidden='true' />
        <Input placeholder='Search artists...' />
      </InputGroup>
    </div>
  ),
};

export const TrailingIcon: Story = {
  render: () => (
    <div className='w-80'>
      <InputGroup>
        <Input type='email' placeholder='you@example.com' />
        <Mail data-slot='icon' aria-hidden='true' />
      </InputGroup>
    </div>
  ),
};

export const BothIcons: Story = {
  render: () => (
    <div className='w-80'>
      <InputGroup>
        <Lock data-slot='icon' aria-hidden='true' />
        <Input type='password' placeholder='Password' />
        <Eye data-slot='icon' aria-hidden='true' />
      </InputGroup>
    </div>
  ),
};

// Sizes
export const Small: Story = {
  render: () => (
    <div className='w-80'>
      <InputGroup size='sm'>
        <Search data-slot='icon' aria-hidden='true' />
        <Input inputSize='sm' placeholder='Search...' />
      </InputGroup>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Match the group `size` with the Input `inputSize`.',
      },
    },
  },
};

export const Large: Story = {
  render: () => (
    <div className='w-80'>
      <InputGroup size='lg'>
        <Search data-slot='icon' aria-hidden='true' />
        <Input inputSize='lg' placeholder='Search...' />
      </InputGroup>
    </div>
  ),
};

// States
export const Disabled: Story = {
  render: () => (
    <div className='w-80'>
      <InputGroup>
        <Search data-slot='icon' aria-hidden='true' />
        <Input disabled defaultValue='Unavailable right now' />
      </InputGroup>
    </div>
  ),
};

export const WithError: Story = {
  render: () => (
    <div className='w-80'>
      <InputGroup>
        <Mail data-slot='icon' aria-hidden='true' />
        <Input
          type='email'
          variant='error'
          defaultValue='not-an-email'
          aria-invalid='true'
        />
      </InputGroup>
    </div>
  ),
};

export const LongContent: Story = {
  render: () => (
    <div className='w-80'>
      <InputGroup>
        <Search data-slot='icon' aria-hidden='true' />
        <Input defaultValue='A search query long enough to reach the trailing edge of the input' />
      </InputGroup>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Leading icon keeps long values clear of the icon slot.',
      },
    },
  },
};

// All Sizes Grid
export const AllSizes: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-4 p-8'>
      <InputGroup size='sm'>
        <Search data-slot='icon' aria-hidden='true' />
        <Input inputSize='sm' placeholder='Small' />
      </InputGroup>
      <InputGroup size='md'>
        <Search data-slot='icon' aria-hidden='true' />
        <Input inputSize='md' placeholder='Medium' />
      </InputGroup>
      <InputGroup size='lg'>
        <Search data-slot='icon' aria-hidden='true' />
        <Input inputSize='lg' placeholder='Large' />
      </InputGroup>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};
