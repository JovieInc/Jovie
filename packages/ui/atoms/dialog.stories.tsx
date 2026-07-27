import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

const meta: Meta<typeof Dialog> = {
  title: 'UI/Atoms/Dialog',
  component: Dialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A modal dialog built on Radix Dialog with a tokenized overlay, centered content, and a built-in close button. Use for focused tasks that require user input or confirmation.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    open: {
      control: { type: 'boolean' },
      description: 'Controls the open state of the dialog',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const termsParagraphs = [
  '1. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  '2. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  '3. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  '4. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  '5. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.',
  '6. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores.',
];

// Basic dialog opened via trigger
export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant='secondary'>Edit profile</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile here. Click save when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3 py-2'>
          <div className='space-y-1'>
            <label className='text-sm font-medium' htmlFor='dialog-name'>
              Name
            </label>
            <input
              id='dialog-name'
              type='text'
              defaultValue='Tim White'
              className='w-full px-3 py-2 text-sm border border-subtle rounded-md bg-surface-0 focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-transparent'
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='secondary'>Cancel</Button>
          </DialogClose>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

// Open state so Chromatic captures the overlay and content
export const Open: Story = {
  render: () => (
    <Dialog defaultOpen modal={false}>
      <DialogTrigger asChild>
        <Button variant='secondary'>Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>
            This dialog renders in the open state so visual tests capture the
            overlay, surface, and close button.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='secondary'>Cancel</Button>
          </DialogClose>
          <Button>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

// Close button hidden via hideClose
export const HiddenCloseButton: Story = {
  render: () => (
    <Dialog defaultOpen modal={false}>
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>No corner close button</DialogTitle>
          <DialogDescription>
            The built-in close button is hidden with hideClose. Users dismiss
            this dialog with the footer actions or the Escape key.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='secondary'>Got it</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

// Long content scrolls within the dialog instead of overflowing the viewport
export const LongContent: Story = {
  render: () => (
    <Dialog defaultOpen modal={false}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terms of service</DialogTitle>
          <DialogDescription>
            Long content stays inside the dialog surface and scrolls.
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-64 space-y-4 overflow-y-auto py-2 text-sm text-secondary-token'>
          {termsParagraphs.map(paragraph => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='secondary'>Decline</Button>
          </DialogClose>
          <Button>Accept</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

// Controlled state example
export const Controlled: Story = {
  render: function ControlledStory() {
    const [open, setOpen] = React.useState(false);

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant='secondary'>
            {open ? 'Close' : 'Open'} controlled dialog
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Controlled Dialog</DialogTitle>
            <DialogDescription>
              This dialog&apos;s state is controlled externally.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='secondary' onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
};
