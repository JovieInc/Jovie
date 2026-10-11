import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useProfileHeaderParts } from './ProfileSidebarHeader';

function ProfileSidebarHeaderDemo({
  username,
  displayName,
  profilePath,
}: {
  readonly username: string;
  readonly displayName: string;
  readonly profilePath: string;
}) {
  const { title, actions } = useProfileHeaderParts({
    username,
    displayName,
    profilePath,
  });
  return (
    <div className='flex items-center justify-between gap-2 rounded-lg border border-subtle bg-surface-0 px-3 py-2'>
      {title}
      {actions}
    </div>
  );
}

const meta = {
  title: 'Organisms/ProfileSidebar/ProfileSidebarHeader',
  component: ProfileSidebarHeaderDemo,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
  args: {
    username: 'tim',
    displayName: 'Tim White',
    profilePath: '/tim',
  },
} satisfies Meta<typeof ProfileSidebarHeaderDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const UsernameOnly: Story = {
  args: {
    displayName: 'tim',
  },
};
