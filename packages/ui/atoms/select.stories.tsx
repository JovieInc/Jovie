import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

const meta: Meta = {
  title: 'UI/Atoms/Select',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Select defaultValue='pro'>
      <SelectTrigger className='w-48' aria-label='Plan'>
        <SelectValue placeholder='Pick a plan' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='free'>Free</SelectItem>
        <SelectItem value='pro'>Pro</SelectItem>
        <SelectItem value='team' disabled>
          Team
        </SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select disabled defaultValue='pro'>
      <SelectTrigger className='w-48' aria-label='Plan'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='pro'>Pro</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const EdgeCollision: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => <EdgeCollisionDemo />,
};

function EdgeCollisionDemo() {
  const [open, setOpen] = useState(true);
  return (
    <div className='flex min-h-64 items-start justify-end p-2'>
      <Select open={open} onOpenChange={setOpen} defaultValue='north-america'>
        <SelectTrigger inert={open} className='w-48' aria-label='Coverage'>
          <SelectValue placeholder='Pick coverage' />
        </SelectTrigger>
        <SelectContent align='end'>
          <SelectItem value='worldwide'>Worldwide</SelectItem>
          <SelectItem value='north-america'>North America</SelectItem>
          <SelectItem value='europe'>Europe</SelectItem>
          <SelectItem value='asia'>Asia</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export const Empty: Story = {
  render: () => (
    <Select>
      <SelectTrigger className='w-48' aria-label='Release status'>
        <SelectValue placeholder='Pick a status' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='draft'>Draft</SelectItem>
        <SelectItem value='live'>Live</SelectItem>
      </SelectContent>
    </Select>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'No value chosen yet: the trigger shows the placeholder until an option is picked.',
      },
    },
  },
};

export const PartialAvailability: Story = {
  render: () => (
    <Select defaultValue='spotify'>
      <SelectTrigger className='w-48' aria-label='Primary platform'>
        <SelectValue placeholder='Pick a platform' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='spotify'>Spotify</SelectItem>
        <SelectItem value='apple'>Apple Music</SelectItem>
        <SelectItem value='tidal' disabled>
          Tidal (not connected)
        </SelectItem>
        <SelectItem value='deezer' disabled>
          Deezer (not connected)
        </SelectItem>
      </SelectContent>
    </Select>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Only some options are available: unconnected platforms stay listed but disabled, so the menu shows the full set without letting them be chosen.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <Select defaultValue='long'>
      <SelectTrigger className='w-48' aria-label='Playlist'>
        <SelectValue placeholder='Pick a playlist' />
      </SelectTrigger>
      <SelectContent className='max-w-72'>
        <SelectItem value='long'>
          Late night drives through the city with the windows down and the
          volume up
        </SelectItem>
        <SelectItem value='short'>Focus</SelectItem>
      </SelectContent>
    </Select>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A long selected label in a narrow trigger clamps to one line beside the chevron instead of growing the control.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl'>
      <Select dir='rtl' defaultValue='weekly'>
        <SelectTrigger className='w-48' aria-label='تكرار الإشعارات'>
          <SelectValue placeholder='اختر عدد مرات الإشعار' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='weekly'>
            ملخص أسبوعي لنشاط المعجبين في جميع ملفاتي الشخصية
          </SelectItem>
          <SelectItem value='instant'>فورًا</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Arabic options in a right-to-left select: the value reads from the start edge, clamps to one line, and the chevron sits at the end.',
      },
    },
  },
};
