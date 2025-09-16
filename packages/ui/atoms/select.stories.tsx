import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UserIcon, SettingsIcon, HelpCircleIcon } from 'lucide-react';
import { Select } from './select';

const meta: Meta<typeof Select> = {
  title: 'UI/Atoms/Select',
  component: Select,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A Radix-based select component with Apple-level polish, keyboard navigation, and accessibility features.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['sm', 'default', 'lg'],
      description: 'Size variant of the select trigger',
    },
    placeholder: {
      control: { type: 'text' },
      description: 'Placeholder text when no value is selected',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Whether the select is disabled',
    },
    required: {
      control: { type: 'boolean' },
      description: 'Whether the select is required (shows asterisk)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Select>;

const basicOptions = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'disabled', label: 'Disabled Option', disabled: true },
];

const longList = Array.from({ length: 25 }, (_, i) => ({
  value: `option-${i + 1}`,
  label: `Option ${i + 1}`,
  disabled: i % 7 === 0, // Some disabled items
}));

const iconOptions = [
  { value: 'profile', label: 'Profile', icon: <UserIcon className="h-4 w-4" /> },
  { value: 'settings', label: 'Settings', icon: <SettingsIcon className="h-4 w-4" /> },
  { value: 'help', label: 'Help', icon: <HelpCircleIcon className="h-4 w-4" /> },
  { value: 'disabled', label: 'Disabled', icon: <UserIcon className="h-4 w-4" />, disabled: true },
];

const groupedOptions = [
  {
    label: 'Fruits',
    options: [
      { value: 'apple', label: 'Apple' },
      { value: 'banana', label: 'Banana' },
      { value: 'cherry', label: 'Cherry' },
    ],
  },
  {
    label: 'Vegetables',
    options: [
      { value: 'carrot', label: 'Carrot' },
      { value: 'broccoli', label: 'Broccoli' },
      { value: 'spinach', label: 'Spinach' },
    ],
  },
];

export const Default: Story = {
  args: {
    options: basicOptions,
    placeholder: 'Select a fruit...',
  },
};

export const WithLabel: Story = {
  args: {
    options: basicOptions,
    placeholder: 'Choose your favorite...',
    label: 'Favorite Fruit',
  },
};

export const Required: Story = {
  args: {
    options: basicOptions,
    placeholder: 'Required selection...',
    label: 'Required Field',
    required: true,
  },
};

export const WithError: Story = {
  args: {
    options: basicOptions,
    placeholder: 'Select an option...',
    label: 'Field with Error',
    error: 'This field is required',
  },
};

export const SmallSize: Story = {
  args: {
    options: basicOptions,
    placeholder: 'Small select...',
    size: 'sm',
  },
};

export const LargeSize: Story = {
  args: {
    options: basicOptions,
    placeholder: 'Large select...',
    size: 'lg',
  },
};

export const Disabled: Story = {
  args: {
    options: basicOptions,
    placeholder: 'Disabled select...',
    disabled: true,
  },
};

export const WithIcons: Story = {
  args: {
    options: iconOptions,
    placeholder: 'Select with icons...',
    label: 'Action',
  },
};

export const LongList: Story = {
  args: {
    options: longList,
    placeholder: 'Select from many options...',
    label: 'Long List (with scroll)',
  },
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates scroll behavior with many options and keyboard navigation.',
      },
    },
  },
};

export const GroupedOptions: Story = {
  args: {
    groups: groupedOptions,
    placeholder: 'Select food...',
    label: 'Food Categories',
  },
  parameters: {
    docs: {
      description: {
        story: 'Options can be grouped with labels for better organization.',
      },
    },
  },
};

export const ControlledState: Story = {
  args: {
    options: basicOptions,
    placeholder: 'Controlled...',
    value: 'banana',
  },
  parameters: {
    docs: {
      description: {
        story: 'Example of controlled state (value prop provided).',
      },
    },
  },
};

export const KeyboardTesting: Story = {
  args: {
    options: basicOptions,
    placeholder: 'Test keyboard navigation...',
    label: 'Keyboard Navigation Test',
  },
  parameters: {
    docs: {
      description: {
        story: 'Test keyboard navigation: Tab to focus, Space/Enter to open, Arrow keys to navigate, Type to search, Escape to close.',
      },
    },
  },
};