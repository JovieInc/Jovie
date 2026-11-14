import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { RightDrawer } from './RightDrawer';

const meta: Meta<typeof RightDrawer> = {
  title: 'Molecules/Drawer/RightDrawer',
  component: RightDrawer,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    isOpen: true,
    width: 360,
    ariaLabel: 'Entity details',
    children: <div className='p-4'>Inspector content</div>,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Closed: Story = {
  args: {
    isOpen: false,
  },
};

function FocusReturnExample() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button
        data-rail-toggle='right'
        aria-controls='focus-return-rail'
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        Toggle inspector
      </Button>
      <RightDrawer
        id='focus-return-rail'
        isOpen={open}
        width={360}
        ariaLabel='Focus return inspector'
      >
        <Button onClick={() => setOpen(false)}>Close inspector</Button>
      </RightDrawer>
    </>
  );
}

export const FocusReturn: Story = {
  render: () => <FocusReturnExample />,
};

/** Nothing selected yet: the inspector shows its empty prompt. */
export const EmptyInspector: Story = {
  args: {
    children: (
      <div className='flex h-full items-center justify-center p-6 text-center text-app text-secondary-token'>
        Select a release to see its details.
      </div>
    ),
  },
};

/** A transient hover preview with only the fields that have loaded so far. */
export const PartialOverlayPreview: Story = {
  args: {
    presentation: 'overlay',
    ariaLabel: 'Release preview',
    children: (
      <div className='space-y-2 p-4'>
        <p className='text-app font-medium text-primary-token'>Night Drive</p>
        <p className='text-xs text-tertiary-token'>Release date not set</p>
      </div>
    ),
  },
};

const longNotes = Array.from(
  { length: 24 },
  (_, index) =>
    `Note ${index + 1}: confirm the artwork crop, the pre-save link and the distributor metadata for the regional storefronts before the release window opens.`
);

/** Content taller than the rail scrolls inside it; the rail keeps its width. */
export const LongContentScrolls: Story = {
  args: {
    children: (
      <div className='h-full space-y-3 overflow-y-auto p-4 text-app text-secondary-token'>
        {longNotes.map(note => (
          <p key={note}>{note}</p>
        ))}
      </div>
    ),
  },
};

/** Right to left: the inspector content follows the writing direction. */
export const RtlArabicContent: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='flex h-dvh justify-end'>
        <Story />
      </div>
    ),
  ],
  args: {
    ariaLabel: 'تفاصيل الإصدار',
    children: (
      <div className='space-y-2 p-4'>
        <p className='text-app font-medium text-primary-token'>قيادة ليلية</p>
        <p className='text-xs text-tertiary-token'>تاريخ الإصدار لم يحدد بعد</p>
      </div>
    ),
  },
};
