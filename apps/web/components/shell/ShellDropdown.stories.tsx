import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Copy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { ShellDropdown } from './ShellDropdown';

const meta = {
  title: 'Shell/ShellDropdown',
  component: ShellDropdown,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='bg-base p-8'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShellDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    trigger: (
      <Button type='button' variant='secondary' size='sm'>
        Actions
      </Button>
    ),
    defaultOpen: true,
    children: (
      <>
        <ShellDropdown.Item label='Copy link' icon={Copy} onSelect={fn()} />
        <ShellDropdown.Separator />
        <ShellDropdown.Item
          label='Delete'
          icon={Trash2}
          tone='danger'
          onSelect={fn()}
        />
      </>
    ),
  },
};

export const Searchable: Story = {
  args: {
    trigger: (
      <Button type='button' variant='secondary' size='sm'>
        Choose a platform
      </Button>
    ),
    defaultOpen: true,
    searchable: true,
    searchPlaceholder: 'Search platforms…',
    children: (
      <>
        <ShellDropdown.Item label='Spotify' onSelect={fn()} />
        <ShellDropdown.Item label='Apple Music' onSelect={fn()} />
        <ShellDropdown.Item label='YouTube Music' onSelect={fn()} />
      </>
    ),
  },
};

function RadioGroupDemo() {
  const [value, setValue] = useState('newest');
  return (
    <ShellDropdown
      trigger={
        <Button type='button' variant='secondary' size='sm'>
          Sort
        </Button>
      }
      defaultOpen
    >
      <ShellDropdown.RadioGroup value={value} onValueChange={setValue}>
        <ShellDropdown.RadioItem value='newest' label='Newest first' />
        <ShellDropdown.RadioItem value='oldest' label='Oldest first' />
      </ShellDropdown.RadioGroup>
    </ShellDropdown>
  );
}

export const WithRadioGroup: Story = {
  args: {
    trigger: (
      <Button type='button' variant='secondary' size='sm'>
        Sort
      </Button>
    ),
    children: null,
  },
  render: () => <RadioGroupDemo />,
};
