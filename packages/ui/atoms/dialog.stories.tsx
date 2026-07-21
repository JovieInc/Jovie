import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import { Button } from './button';

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
          <DialogDescription>Update your public display name.</DialogDescription>
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
          <DialogDescription>Long content should wrap without overflow.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  ),
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
