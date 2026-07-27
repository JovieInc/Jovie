import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Label } from './label';
import { Switch } from './switch';

const meta: Meta<typeof Switch> = {
  title: 'shadcn/Switch',
  component: Switch,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'System B switch component. 28×16px track, 12×12px thumb, tokenized 150ms state transition. Built on Radix UI with keyboard navigation, disabled state, and focus ring.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    defaultChecked: {
      control: { type: 'boolean' },
      description: 'Initial checked state (uncontrolled)',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Disabled state',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Core States
export const Default: Story = {};

export const Checked: Story = {
  args: {
    defaultChecked: true,
  },
};

// States
export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const DisabledChecked: Story = {
  args: {
    defaultChecked: true,
    disabled: true,
  },
};

// Composition Examples
export const WithLabel: Story = {
  render: args => (
    <div className='flex items-center gap-2'>
      <Switch {...args} id='notifications' defaultChecked />
      <Label htmlFor='notifications'>Enable notifications</Label>
    </div>
  ),
};

// Dark Mode Preview
export const DarkMode: Story = {
  args: {
    defaultChecked: true,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

// All States Grid
export const AllStates: Story = {
  render: () => (
    <div className='flex flex-col gap-4 p-8'>
      <div className='flex items-center gap-2'>
        <Switch id='state-off' />
        <Label htmlFor='state-off'>Off</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Switch id='state-on' defaultChecked />
        <Label htmlFor='state-on'>On</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Switch id='state-disabled' disabled />
        <Label htmlFor='state-disabled'>Disabled</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Switch id='state-disabled-on' defaultChecked disabled />
        <Label htmlFor='state-disabled-on'>Disabled on</Label>
      </div>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};
