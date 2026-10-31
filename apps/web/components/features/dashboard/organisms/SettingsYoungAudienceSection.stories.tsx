import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import privacyMeta from './DataPrivacySection.stories';
import { SettingsYoungAudienceSection } from './SettingsYoungAudienceSection';

const meta = {
  title: 'Dashboard/Organisms/SettingsYoungAudienceSection',
  component: SettingsYoungAudienceSection,
  args: privacyMeta.args,
  parameters: privacyMeta.parameters,
  decorators: [
    Story => (
      <div className='max-w-2xl'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsYoungAudienceSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Enabled: Story = {
  args: { artist: { ...meta.args.artist, young_audience: true } },
};
