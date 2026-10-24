import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EarlyAccessSettingsSection } from './EarlyAccessSettingsSection';

const meta = {
  title: 'Dashboard/Organisms/AccountSettings/EarlyAccessSettingsSection',
  component: EarlyAccessSettingsSection,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => (
      <div className='max-w-2xl'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EarlyAccessSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
