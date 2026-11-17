import { TooltipProvider } from '@jovie/ui';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { ProviderStatusDot } from './ProviderStatusDot';

const withTooltips: Decorator = Story => (
  <TooltipProvider>
    <Story />
  </TooltipProvider>
);

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const meta = {
  title:
    'Features/Dashboard/Organisms/Releases/Components/ProviderStatusDot States',
  component: ProviderStatusDot,
  parameters: { layout: 'centered' },
  decorators: [withTooltips],
  args: { status: 'available', accent: '#1DB954' },
} satisfies Meta<typeof ProviderStatusDot>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no provider link on file. */
export const EmptyMissingLink: Story = {
  args: { status: 'missing' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('img', { name: 'Missing provider link' })
    ).toHaveAttribute('data-provider-status', 'missing');
  },
};

/** Right-to-left: a manually added link inside an RTL document. */
export const RtlManualLink: Story = {
  args: { status: 'manual' },
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('img', {
        name: 'Manually added provider link',
      })
    ).toBeVisible();
  },
};
