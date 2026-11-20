import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

const meta: Meta = {
  title: 'UI/Atoms/Dialog',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Update your public display name.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant='secondary'>Cancel</Button>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Narrow: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent className='max-w-xs'>
        <DialogHeader>
          <DialogTitle>Narrow container</DialogTitle>
          <DialogDescription>
            Long content should wrap without overflow.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  ),
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const ScrollContained: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review profile changes</DialogTitle>
          <DialogDescription>
            The panel remains inside the viewport while long content scrolls.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-3'>
          {['Identity', 'Links', 'Audience', 'Territories', 'Sources'].map(
            section => (
              <div
                key={section}
                className='rounded-(--system-b-radius-panel-inner) border border-subtle bg-surface-1 p-4'
              >
                <p className='text-sm font-medium text-primary-token'>
                  {section}
                </p>
                <p className='mt-1 text-xs text-secondary-token'>
                  Review the current {section.toLowerCase()} settings before
                  saving.
                </p>
              </div>
            )
          )}
        </div>
        <DialogFooter>
          <Button variant='secondary'>Cancel</Button>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const Fullscreen: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent variant='fullscreen'>
        <DialogTitle>Workspace search</DialogTitle>
        <DialogDescription>Full-screen search takeover.</DialogDescription>
      </DialogContent>
    </Dialog>
  ),
};

export const Partial: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Rename playlist</DialogTitle>
      </DialogContent>
    </Dialog>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Only the required title, with the optional header, description and footer omitted; the close button still anchors the corner.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent className='max-w-sm'>
        <DialogHeader>
          <DialogTitle>
            Review every change to your artist profile, release links and
            audience settings before publishing
          </DialogTitle>
          <DialogDescription>
            Publishing pushes the updated profile to every public link,
            including smart links already shared with fans, playlist curators
            and press contacts across all of your connected platforms.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant='secondary'>Keep editing</Button>
          <Button>Publish all profile changes now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        story:
          'A long title, description and action labels wrap inside a narrow dialog without horizontal overflow.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl'>
      <Dialog defaultOpen>
        <DialogContent dir='rtl'>
          <DialogHeader>
            <DialogTitle>
              تعديل الملف الشخصي للفنان وروابط الإصدارات
            </DialogTitle>
            <DialogDescription>
              حدّث اسمك المعروض وصورتك ونبذتك التعريفية. تظهر هذه التغييرات فورًا
              على صفحتك العامة وعلى جميع الروابط التي شاركتها مع جمهورك.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='secondary'>إلغاء</Button>
            <Button>حفظ التغييرات</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  ),
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        story:
          'Right-to-left Arabic copy wraps inside the dialog and the footer actions follow the reading direction.',
      },
    },
  },
};
