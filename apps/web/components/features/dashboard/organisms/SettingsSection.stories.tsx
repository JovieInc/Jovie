import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RenderedFamily } from '@/.storybook/rendered-family';
import { SettingsGroup } from '@/components/molecules/settings/SettingsPanel';
import { SettingsRow } from '@/components/molecules/settings/SettingsRow';
import { SettingsSection } from './SettingsSection';

const meta = {
  title: 'Dashboard/Organisms/SettingsSection',
  component: SettingsSection,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story, context) => (
      <RenderedFamily
        name='settings-section'
        owner='SettingsSection'
        interactive={Boolean(context.args.headerAction)}
      >
        <Story />
      </RenderedFamily>
    ),
  ],
  args: {
    id: 'audience-tracking',
    title: 'Audience & tracking',
    children: (
      <SettingsGroup title='Audience verification'>
        <SettingsRow
          title='Double opt-in verification'
          description='New fans confirm their email before notifications begin.'
        />
      </SettingsGroup>
    ),
  },
} satisfies Meta<typeof SettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHeaderAction: Story = {
  decorators: [
    Story => (
      <div className='max-w-sm'>
        <Story />
      </div>
    ),
  ],
  args: {
    headerAction: (
      <Button variant='secondary' size='sm'>
        View Profile
      </Button>
    ),
  },
};
