import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import privacyMeta, { YoungAudience } from './DataPrivacySection.stories';
import { SettingsYoungAudienceSection } from './SettingsYoungAudienceSection';

const meta = {
  ...privacyMeta,
  title: 'Dashboard/Organisms/SettingsYoungAudienceSection',
  component: SettingsYoungAudienceSection,
} satisfies Meta<typeof SettingsYoungAudienceSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Enabled: Story = { args: YoungAudience.args };
