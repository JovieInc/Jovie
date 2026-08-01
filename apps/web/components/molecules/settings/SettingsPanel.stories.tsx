import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SettingsPanel } from './SettingsPanel';

const meta: Meta<typeof SettingsPanel> = {
  title: 'Molecules/Settings/SettingsPanel',
  component: SettingsPanel,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'Appearance',
    description: 'Theme and contrast preferences for your workspace.',
    children: (
      <div className='w-160 px-4 py-4 text-app text-secondary-token'>
        Compact settings content
      </div>
    ),
  },
};

export default meta;
type Story = StoryObj<typeof SettingsPanel>;

export const Default: Story = {};

export const WithAction: Story = {
  args: {
    actions: (
      <Button type='button' size='sm'>
        Save
      </Button>
    ),
  },
};
