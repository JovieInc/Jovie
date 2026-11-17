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
    hideClose: {
      control: 'boolean',
      description: 'Hide the canonical close control for blocking flows.',
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
              {
                // biome-ignore lint/a11y/noLabelWithoutControl: Story example - not a real form
                <label className='text-sm font-medium'>Display Name</label>
              }
              <input
                type='text'
                className='w-full px-3 py-2 border border-subtle rounded-lg'
                placeholder='Your name'
              />
            </div>
            <div className='space-y-2'>
              {
                // biome-ignore lint/a11y/noLabelWithoutControl: Story example - not a real form
                <label className='text-sm font-medium'>Bio</label>
              }
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

export const BlockingFlow: Story = {
  args: {
    open: true,
    onClose: () => console.log('Close'),
    size: 'sm',
    hideClose: true,
    children: (
      <>
        <DialogTitle>Finish account setup</DialogTitle>
        <DialogDescription>
          Complete this step before returning to your workspace.
        </DialogDescription>
        <DialogBody>
          <p className='text-secondary'>
            Your progress is saved automatically.
          </p>
        </DialogBody>
        <DialogActions>
          <Button variant='primary'>Continue</Button>
        </DialogActions>
      </>
    ),
  },
};

export const Empty: Story = {
  args: {
    open: true,
    onClose: () => console.log('Close'),
    size: 'md',
    children: (
      <>
        <DialogTitle>Import releases</DialogTitle>
        <DialogDescription>
          Nothing has been added to this dialog yet.
        </DialogDescription>
        <DialogBody />
        <DialogActions>
          <Button variant='outline'>Done</Button>
        </DialogActions>
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          'An empty DialogBody keeps the title, description and actions in their slots without collapsing the frame.',
      },
    },
  },
};

export const PartialTitleOnly: Story = {
  args: {
    open: true,
    onClose: () => console.log('Close'),
    size: 'sm',
    children: <DialogTitle>Saving your changes</DialogTitle>,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Only the required title is supplied: no description, body or actions. The close control still sits clear of the title.',
      },
    },
  },
};

const LONG_TITLE =
  'Transfer ownership of the Midnight Sessions Vol. 2 (Deluxe Extended Anniversary Edition) release and every linked smart link';
const LONG_DESCRIPTION =
  'The new owner receives full control of the release, its 48 tracks, all pre-save campaigns, every smart link and the fan contact list collected from them. You keep read-only access to past analytics.';
const LONG_URL =
  'https://jov.ie/midnightsessions/midnight-sessions-vol-2-deluxe-extended-anniversary-edition-remastered-bonus-tracks-live-from-the-hollywood-bowl';

export const LongContent: Story = {
  args: {
    open: true,
    onClose: () => console.log('Close'),
    size: 'md',
    children: (
      <>
        <DialogTitle>{LONG_TITLE}</DialogTitle>
        <DialogDescription>{LONG_DESCRIPTION}</DialogDescription>
        <DialogBody>
          <div className='space-y-3 text-secondary'>
            <p>
              Smart link: <span className='break-all'>{LONG_URL}</span>
            </p>
            <p>
              Ownership transfers apply immediately. Scheduled release-day
              emails, pre-save reminders and countdown pages move with the
              release, and collaborators invited by you will be asked to accept
              the new owner before their access continues. Payouts already in
              flight finish on the current account; future payouts follow the
              new owner&apos;s connected distributor.
            </p>
          </div>
        </DialogBody>
        <DialogActions>
          <Button variant='outline'>Keep ownership of this release</Button>
          <Button variant='destructive'>
            Transfer release and all smart links
          </Button>
        </DialogActions>
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          'A long title, description, unbroken URL and long action labels wrap inside the dialog without horizontal overflow.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl'>
      <Dialog open onClose={() => console.log('Close')} size='md'>
        <DialogTitle dir='rtl'>
          تعديل الملف الشخصي للفنان وروابط الإصدارات
        </DialogTitle>
        <DialogDescription dir='rtl'>
          حدّث اسمك المعروض وصورتك ونبذتك التعريفية. تظهر هذه التغييرات فورًا على
          صفحتك العامة وعلى جميع الروابط التي شاركتها مع جمهورك.
        </DialogDescription>
        <DialogBody dir='rtl'>
          <p className='text-secondary'>
            رابط الإصدار:{' '}
            <span className='break-all'>
              https://jov.ie/midnightsessions/midnight-sessions-vol-2-deluxe-edition
            </span>
          </p>
        </DialogBody>
        <DialogActions dir='rtl'>
          <Button variant='outline'>إلغاء</Button>
          <Button variant='primary'>حفظ التغييرات</Button>
        </DialogActions>
      </Dialog>
    </div>
  ),
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        story:
          'Right-to-left Arabic copy and a long link wrap inside each dialog slot, and the actions follow the reading direction.',
      },
    },
  },
};
