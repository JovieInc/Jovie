import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from './Dialog';

const meta: Meta<typeof Dialog> = {
  title: 'Organisms/Dialog',
  component: Dialog,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Dialog>;

export const Default: Story = {
  args: {
    open: true,
    onClose: () => console.log('Close'),
    size: 'lg',
    children: (
      <>
        <DialogTitle>Dialog Title</DialogTitle>
        <DialogDescription>
          This is a description of the dialog content.
        </DialogDescription>
        <DialogBody>
          <p className='text-secondary'>
            This is the main body content of the dialog. You can put any content
            here.
          </p>
        </DialogBody>
        <DialogActions>
          <Button variant='outline'>Cancel</Button>
          <Button variant='primary'>Confirm</Button>
        </DialogActions>
      </>
    ),
  },
};

export const Small: Story = {
  args: {
    open: true,
    onClose: () => console.log('Close'),
    size: 'sm',
    children: (
      <>
        <DialogTitle>Confirm Action</DialogTitle>
        <DialogDescription>Are you sure you want to proceed?</DialogDescription>
        <DialogActions>
          <Button variant='outline' size='sm'>
            Cancel
          </Button>
          <Button variant='primary' size='sm'>
            Confirm
          </Button>
        </DialogActions>
      </>
    ),
  },
};

export const Large: Story = {
  args: {
    open: true,
    onClose: () => console.log('Close'),
    size: '2xl',
    children: (
      <>
        <DialogTitle>Edit Profile</DialogTitle>
        <DialogDescription>
          Update your profile information below.
        </DialogDescription>
        <DialogBody>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <label className='text-sm font-medium'>Display Name</label>
              <input
                type='text'
                className='w-full px-3 py-2 border border-subtle rounded-lg'
                placeholder='Your name'
              />
            </div>
            <div className='space-y-2'>
              <label className='text-sm font-medium'>Bio</label>
              <textarea
                className='w-full px-3 py-2 border border-subtle rounded-lg'
                rows={3}
                placeholder='Tell us about yourself'
              />
            </div>
          </div>
        </DialogBody>
        <DialogActions>
          <Button variant='outline'>Cancel</Button>
          <Button variant='primary'>Save Changes</Button>
        </DialogActions>
      </>
    ),
  },
};

export const Interactive: Story = {
  render: function InteractiveDialog() {
    const [open, setOpen] = useState(false);

    return (
      <div>
        <Button onClick={() => setOpen(true)}>Open Dialog</Button>
        <Dialog open={open} onClose={() => setOpen(false)} size='md'>
          <DialogTitle>Interactive Dialog</DialogTitle>
          <DialogDescription>
            This dialog can be opened and closed interactively.
          </DialogDescription>
          <DialogBody>
            <p className='text-secondary'>
              Click the buttons below to interact with this dialog.
            </p>
          </DialogBody>
          <DialogActions>
            <Button variant='outline' onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant='primary' onClick={() => setOpen(false)}>
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
      </div>
    );
  },
};

export const DeleteConfirmation: Story = {
  args: {
    open: true,
    onClose: () => console.log('Close'),
    size: 'sm',
    children: (
      <>
        <DialogTitle>Delete Link</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete this link? This action cannot be
          undone.
        </DialogDescription>
        <DialogActions>
          <Button variant='outline'>Cancel</Button>
          <Button variant='destructive'>Delete</Button>
        </DialogActions>
      </>
    ),
  },
};
