import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RefreshCw } from 'lucide-react';
import { SettingsActionRow } from './SettingsActionRow';

const meta = {
  title: 'Dashboard/Molecules/SettingsActionRow',
  component: SettingsActionRow,
  parameters: {
    layout: 'centered',
  },
  args: {
    icon: <RefreshCw className='h-4 w-4' aria-hidden />,
    title: 'Resync catalog',
    description:
      'Pull the latest releases and DSP links for this artist profile.',
    action: (
      <Button type='button' variant='secondary' size='sm'>
        Resync
      </Button>
    ),
  },
} satisfies Meta<typeof SettingsActionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: {
    disabled: true,
    title: 'Resync catalog',
    description: 'Connect a DSP account to enable syncing.',
    action: (
      <Button type='button' variant='secondary' size='sm' disabled>
        Resync
      </Button>
    ),
  },
};
