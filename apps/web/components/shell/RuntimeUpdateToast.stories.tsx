import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FeedbackProvider } from '@/components/feedback';
import { RuntimeUpdateToast } from './RuntimeUpdateToast';

const meta = {
  title: 'Shell/RuntimeUpdateToast',
  component: RuntimeUpdateToast,
  decorators: [
    Story => (
      <FeedbackProvider>
        <Story />
      </FeedbackProvider>
    ),
  ],
  args: {
    available: true,
    busy: false,
    title: 'Restart Jovie To Update',
    description: 'Install the available update when you are ready.',
    apply: () => {},
  },
} satisfies Meta<typeof RuntimeUpdateToast>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Downloading: Story = {
  args: {
    busy: true,
    title: 'Downloading Jovie Update…',
    description:
      'The update will be ready to install when the download completes.',
  },
};
export const Installing: Story = {
  args: {
    busy: true,
    title: 'Updating Jovie…',
    description: 'Installing the update and restarting Jovie…',
  },
};
export const BrowserUpdate: Story = {
  args: {
    title: 'Reload Jovie To Update',
    description: 'New Version Available (v26.9.1). Reload when ready.',
  },
};
export const NoUpdate: Story = { args: { available: false } };
