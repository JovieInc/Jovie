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
  parameters: {
    layout: 'centered',
    chromatic: { viewports: [390, 768, 1280] },
  },
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
            {Array.from({ length: 12 }, (_, index) => index + 1).map(track => (
              <span key={track} className='mt-2 block'>
                Track {track} will no longer appear on your public release page.
                Saved links to this track will stop working, and you will need
                to upload it again to publish it in a future release.
              </span>
            ))}
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

export const Partial: Story = {
  render: () => (
    <AlertDialog defaultOpen>
      <AlertDialogContent aria-describedby={undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard draft?</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Only the required title and actions, with the optional description and trigger omitted; the layout stays balanced.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl'>
      <AlertDialog defaultOpen>
        <AlertDialogContent dir='rtl'>
          <AlertDialogHeader>
            <AlertDialogTitle>
              هل تريد حذف هذا الإصدار نهائيًا من مكتبتك الموسيقية؟
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الإصدار وجميع المقاطع المرتبطة به، وستتوقف الروابط العامة
              التي شاركتها مع جمهورك عن العمل فورًا. يبقى سجل الإحصائيات متاحًا
              لك.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction variant='destructive'>
              حذف الإصدار
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  ),
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        story:
          'Right-to-left Arabic copy wraps inside the dialog and the footer actions mirror their order.',
      },
    },
  },
};
