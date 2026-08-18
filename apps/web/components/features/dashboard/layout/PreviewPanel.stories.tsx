import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PreviewPanelProvider } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { PreviewPanel } from './PreviewPanel';

const meta = {
  title: 'Dashboard/PreviewPanel',
  component: PreviewPanel,
  decorators: [
    Story => (
      <PreviewPanelProvider defaultOpen>
        <Story />
      </PreviewPanelProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The canonical dashboard live-preview drawer. This loading state remains visible while preview data hydrates.',
      },
    },
  },
} satisfies Meta<typeof PreviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};
