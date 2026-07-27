import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';

const meta: Meta<typeof Select> = {
  title: 'shadcn/Select',
  component: Select,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Select built on Radix UI with grouped options, labels, separators, and scroll buttons. Compose Select with SelectTrigger, SelectValue, SelectContent, and SelectItem.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    disabled: {
      control: { type: 'boolean' },
      description: 'Disable the trigger',
    },
    open: {
      control: { type: 'boolean' },
      description: 'Control the open state of the listbox',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

function FruitItems() {
  return (
    <>
      <SelectItem value='apple'>Apple</SelectItem>
      <SelectItem value='banana'>Banana</SelectItem>
      <SelectItem value='orange'>Orange</SelectItem>
    </>
  );
}

// Core States
export const Default: Story = {
  render: args => (
    <Select {...args}>
      <SelectTrigger className='w-64'>
        <SelectValue placeholder='Select a fruit' />
      </SelectTrigger>
      <SelectContent>
        <FruitItems />
      </SelectContent>
    </Select>
  ),
};

export const WithDefaultValue: Story = {
  render: args => (
    <Select {...args} defaultValue='banana'>
      <SelectTrigger className='w-64'>
        <SelectValue placeholder='Select a fruit' />
      </SelectTrigger>
      <SelectContent>
        <FruitItems />
      </SelectContent>
    </Select>
  ),
};

export const Disabled: Story = {
  render: args => (
    <Select {...args} disabled defaultValue='apple'>
      <SelectTrigger className='w-64'>
        <SelectValue placeholder='Select a fruit' />
      </SelectTrigger>
      <SelectContent>
        <FruitItems />
      </SelectContent>
    </Select>
  ),
};

export const WithGroupsAndSeparator: Story = {
  render: args => (
    <Select {...args} defaultValue='carrot'>
      <SelectTrigger className='w-64'>
        <SelectValue placeholder='Select a food' />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Fruits</SelectLabel>
          <FruitItems />
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Vegetables</SelectLabel>
          <SelectItem value='carrot'>Carrot</SelectItem>
          <SelectItem value='potato'>Potato</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

// Open Listbox (Chromatic captures the dropdown)
export const OpenListbox: Story = {
  render: args => (
    <div className='pb-56'>
      <Select {...args} open defaultValue='banana'>
        <SelectTrigger className='w-64'>
          <SelectValue placeholder='Select a food' />
        </SelectTrigger>
        <SelectContent disablePortal>
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <FruitItems />
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Vegetables</SelectLabel>
            <SelectItem value='carrot'>Carrot</SelectItem>
            <SelectItem value='potato'>Potato</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Listbox rendered open with the portal disabled so visual tests capture the dropdown.',
      },
    },
  },
};

// Content Stress
export const LongOptions: Story = {
  render: args => (
    <Select {...args} defaultValue='long'>
      <SelectTrigger className='w-64'>
        <SelectValue placeholder='Select a plan' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='short'>Pro</SelectItem>
        <SelectItem value='long'>
          Pro with priority support and unlimited everything
        </SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const NarrowTrigger: Story = {
  render: args => (
    <Select {...args} defaultValue='banana'>
      <SelectTrigger className='w-32'>
        <SelectValue placeholder='Pick' />
      </SelectTrigger>
      <SelectContent>
        <FruitItems />
      </SelectContent>
    </Select>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Trigger constrained to 128px to verify value truncation.',
      },
    },
  },
};

// Dark Mode Preview
export const DarkMode: Story = {
  render: args => (
    <Select {...args} defaultValue='banana'>
      <SelectTrigger className='w-64'>
        <SelectValue placeholder='Select a fruit' />
      </SelectTrigger>
      <SelectContent>
        <FruitItems />
      </SelectContent>
    </Select>
  ),
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
