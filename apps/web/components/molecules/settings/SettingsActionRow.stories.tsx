import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Download, Trash2 } from 'lucide-react';
import { SettingsActionRow } from './SettingsActionRow';

const meta: Meta<typeof SettingsActionRow> = {
  title: 'Molecules/Settings/SettingsActionRow',
  component: SettingsActionRow,
  parameters: {
    layout: 'centered',
  },
  args: {
    icon: <Download className='h-4 w-4' aria-hidden />,
    title: 'Export Data',
    description:
      'Download a portable copy of your profile, links, contacts, and account settings.',
    action: (
      <Button type='button' variant='secondary' size='sm'>
        Export Data
      </Button>
    ),
  },
};

export default meta;
type Story = StoryObj<typeof SettingsActionRow>;

export const Default: Story = {};

export const Disabled: Story = {
  args: {
    disabled: true,
    title: 'Subscribe URL',
    description: 'Publish your profile to enable this setting.',
    action: (
      <Button type='button' variant='secondary' size='sm' disabled>
        Copy Link
      </Button>
    ),
  },
};

export const Destructive: Story = {
  args: {
    tone: 'destructive',
    icon: <Trash2 className='h-4 w-4' aria-hidden />,
    title: 'Delete Account',
    description:
      'Permanently remove your account, profile, contacts, and all associated data.',
    action: (
      <Button type='button' size='sm' destructive>
        Delete Account
      </Button>
    ),
  },
};
