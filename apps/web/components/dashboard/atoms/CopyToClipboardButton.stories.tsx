import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CopyToClipboardButton } from './CopyToClipboardButton';

const meta: Meta<typeof CopyToClipboardButton> = {
  title: 'Dashboard/Atoms/CopyToClipboardButton',
  component: CopyToClipboardButton,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof CopyToClipboardButton>;

export const Default: Story = {
  args: {
    relativePath: '/johndoe',
  },
};

export const CustomLabels: Story = {
  args: {
    relativePath: '/artist-profile',
    idleLabel: 'Share Profile',
    successLabel: 'Link Copied!',
    errorLabel: 'Copy Failed',
  },
};

export const ShortPath: Story = {
  args: {
    relativePath: '/jd',
    idleLabel: 'Copy Link',
  },
};

export const InContext: Story = {
  render: () => (
    <div className='p-4 border border-subtle rounded-lg bg-surface space-y-3 w-80'>
      <div className='flex items-center justify-between'>
        <div>
          <p className='text-sm font-medium'>Your Profile URL</p>
          <p className='text-xs text-secondary'>jov.ie/johndoe</p>
        </div>
        <CopyToClipboardButton relativePath='/johndoe' />
      </div>
    </div>
  ),
};
