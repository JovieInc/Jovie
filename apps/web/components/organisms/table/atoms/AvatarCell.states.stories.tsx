import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { AvatarCell } from './AvatarCell';

/** Rendered states of the avatar cell beyond the default stories. */
const meta = {
  title: 'Organisms/Table/Atoms/AvatarCell/States',
  component: AvatarCell,
  parameters: { layout: 'centered' },
  args: {
    profileId: 'artist-1',
    username: 'tim',
    avatarUrl: null,
    displayName: 'Tim White',
  },
} satisfies Meta<typeof AvatarCell>;

export default meta;
type Story = StoryObj<typeof meta>;

function CellFrame({
  children,
  dir,
}: Readonly<{ children: ReactNode; dir?: 'rtl' }>) {
  return (
    <div dir={dir} className='w-56'>
      {children}
    </div>
  );
}

function withCellFrame(StoryFn: () => ReactNode) {
  return <CellFrame>{StoryFn()}</CellFrame>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <CellFrame dir='rtl'>{StoryFn()}</CellFrame>;
}

/** Empty: no display name and no avatar leaves the linked username as the name. */
export const EmptyNoDisplayName: Story = {
  args: { displayName: null },
  decorators: [withCellFrame],
};

/** Partial: a name with no avatar and the username link disabled. */
export const PartialLinkDisabled: Story = {
  args: { disableUsernameLink: true },
  decorators: [withCellFrame],
};

/** Long content: a long name and handle truncate in the cell. */
export const LongContentTruncated: Story = {
  args: {
    username: 'a-very-long-artist-handle-that-keeps-going',
    displayName: 'An Artist With An Exceptionally Long Stage Name',
    isFeatured: true,
  },
  decorators: [withCellFrame],
};

/** Rtl: the face, name and featured star mirror in a right-to-left row. */
export const RtlFeatured: Story = {
  args: { displayName: 'تيم وايت', isFeatured: true, verified: true },
  decorators: [withRtlFrame],
};
