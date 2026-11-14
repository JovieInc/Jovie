import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { AdminSystemMap } from './AdminSystemMap';

function RtlPageDecorator(Story: () => ReactNode) {
  return (
    <div className='min-h-screen bg-surface-page p-4 sm:p-6' dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the system map. Its only prop is the active tab and its
 * content comes from checked-in registries, so the one state a story can
 * change is the document direction.
 */
const meta = {
  title: 'Features/Admin/System Map/AdminSystemMap States',
  component: AdminSystemMap,
  parameters: { layout: 'fullscreen' },
  decorators: [RtlPageDecorator],
} satisfies Meta<typeof AdminSystemMap>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: connector cards mirror inside an RTL document. */
export const RtlConnectors: Story = {
  args: { activeTab: 'connectors' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('system-map-connectors')).toBeVisible();
  },
};

/** Right-to-left: memory entity chips wrap from the right edge. */
export const RtlMemory: Story = {
  args: { activeTab: 'memory' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('recording')).toBeVisible();
  },
};
