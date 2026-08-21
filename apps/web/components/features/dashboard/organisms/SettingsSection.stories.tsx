import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsSection } from './SettingsSection';

const meta = {
  title: 'Dashboard/Organisms/SettingsSection',
  component: SettingsSection,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    id: 'audience',
    title: 'Audience & Tracking',
    description: 'Fan verification, opt-ins, and tracking.',
    children: (
      <SettingsPanel
        title='Audience verification'
        description='Control whether new fans must confirm their email.'
        bodyClassName='px-4 py-4 sm:px-5'
      >
        <p className='text-app text-secondary-token'>Settings content</p>
      </SettingsPanel>
    ),
  },
} satisfies Meta<typeof SettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHeaderAction: Story = {
  args: {
    headerAction: (
      <Button variant='secondary' size='sm'>
        View Profile
      </Button>
    ),
  },
};
