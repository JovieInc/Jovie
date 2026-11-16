import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { OperationalControlPanel } from './OperationalControlPanel';

/** State coverage for the admin Ops operational toggles. */
const meta = {
  title: 'Features/Admin/OperationalControlPanel',
  component: OperationalControlPanel,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <div className='max-w-2xl'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OperationalControlPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the panel and its toggle row inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Operational controls')).toBeVisible();
    await expect(
      canvas.getByRole('switch', { name: 'Dev toolbar' })
    ).toBeVisible();
  },
};
