import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseSmartLinkSection } from './ReleaseSmartLinkSection';

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseSmartLinkSection',
  component: ReleaseSmartLinkSection,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ReleaseSmartLinkSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    smartLinkPath: '/tim/midnight-drive',
  },
};
