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
