import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';

const meta: Meta<typeof Sheet> = {
  title: 'UI/Atoms/Sheet',
  component: Sheet,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A slide-in panel built on Radix Dialog. Slides from any of the four viewport edges (right by default) with a tokenized overlay, and is ideal for secondary flows like filters, settings, or detail panels.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    open: {
      control: { type: 'boolean' },
      description: 'Controls the open state of the sheet',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const activityEvents = Array.from(
  { length: 12 },
  (_, i) =>
    `${i + 1}. Stream milestone reached on "Midnight Sessions" — your track crossed ${
      (i + 1) * 1000
    } plays across all platforms this week.`
);

// Basic sheet opened via trigger (slides from the right by default)
export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant='secondary'>Open sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Notification settings</SheetTitle>
          <SheetDescription>
            Choose which updates you want to receive about your releases.
          </SheetDescription>
        </SheetHeader>
        <div className='space-y-3 py-4'>
          <div className='flex items-center space-x-2'>
            <input id='sheet-email' type='checkbox' defaultChecked />
            <label className='text-sm' htmlFor='sheet-email'>
              Email notifications
            </label>
          </div>
          <div className='flex items-center space-x-2'>
            <input id='sheet-push' type='checkbox' />
            <label className='text-sm' htmlFor='sheet-push'>
              Push notifications
            </label>
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant='secondary'>Cancel</Button>
          </SheetClose>
          <Button>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

// Open state so Chromatic captures the overlay and panel
export const Open: Story = {
  render: () => (
    <Sheet defaultOpen modal={false}>
      <SheetTrigger asChild>
        <Button variant='secondary'>Open sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sheet title</SheetTitle>
          <SheetDescription>
            This sheet renders in the open state so visual tests capture the
            overlay, panel, and close button.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant='secondary'>Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

// Left-side sheet in the open state
export const LeftOpen: Story = {
  render: () => (
    <Sheet defaultOpen modal={false}>
      <SheetContent side='left'>
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>
            Sheets can slide in from any edge. This one uses
            side=&quot;left&quot;.
          </SheetDescription>
        </SheetHeader>
        <nav className='flex flex-col gap-1 py-4 text-sm'>
          <span className='rounded-md px-2 py-1.5 hover:bg-surface-2'>
            Overview
          </span>
          <span className='rounded-md px-2 py-1.5 hover:bg-surface-2'>
            Releases
          </span>
          <span className='rounded-md px-2 py-1.5 hover:bg-surface-2'>
            Audience
          </span>
        </nav>
      </SheetContent>
    </Sheet>
  ),
};

// All four sides as triggers
export const Sides: Story = {
  render: () => (
    <div className='grid grid-cols-2 gap-4 p-8'>
      {(['top', 'bottom', 'left', 'right'] as const).map(side => (
        <Sheet key={side}>
          <SheetTrigger asChild>
            <Button variant='secondary' className='capitalize'>
              {side}
            </Button>
          </SheetTrigger>
          <SheetContent side={side}>
            <SheetHeader>
              <SheetTitle className='capitalize'>{side} sheet</SheetTitle>
              <SheetDescription>
                This sheet slides in from the {side} edge of the viewport.
              </SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  ),
};

// Long content scrolls inside the panel
export const LongContent: Story = {
  render: () => (
    <Sheet defaultOpen modal={false}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Activity log</SheetTitle>
          <SheetDescription>
            Long content scrolls inside the sheet panel.
          </SheetDescription>
        </SheetHeader>
        <div className='flex-1 space-y-4 overflow-y-auto py-4 text-sm text-secondary-token'>
          {activityEvents.map(event => (
            <p key={event}>{event}</p>
          ))}
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant='secondary'>Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
