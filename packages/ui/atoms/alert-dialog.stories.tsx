import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog';
import { Button } from './button';

const meta: Meta = {
  title: 'UI/Atoms/AlertDialog',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <AlertDialog defaultOpen>
      <AlertDialogTrigger asChild>
        <Button variant='secondary'>Open</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete track?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the track from your library.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
};

export const LongContent: Story = {
  render: () => (
    <AlertDialog defaultOpen>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Confirm a very long destructive action that wraps onto multiple
            lines
          </AlertDialogTitle>
          <AlertDialogDescription>
            <span className='block'>
              The release will be removed from Jovie.
            </span>
            <span className='mt-2 block'>
              Existing public links will stop working.
            </span>
            <span className='mt-2 block'>
              Analytics history will remain available.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const Destructive: Story = {
  render: () => (
    <AlertDialog defaultOpen>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove collaborator?</AlertDialogTitle>
          <AlertDialogDescription>
            Maya will immediately lose access to this workspace.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep access</AlertDialogCancel>
          <AlertDialogAction variant='destructive'>
            Remove access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
};
