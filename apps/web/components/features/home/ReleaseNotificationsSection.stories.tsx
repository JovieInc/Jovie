import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseNotificationsSection } from './ReleaseNotificationsSection';

const meta = {
  title: 'Marketing/Sections/ReleaseNotificationsSection',
  component: ReleaseNotificationsSection,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ReleaseNotificationsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
