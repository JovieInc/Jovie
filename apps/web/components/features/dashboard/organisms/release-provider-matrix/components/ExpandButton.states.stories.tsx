import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { ExpandButton } from './ExpandButton';

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const meta = {
  title: 'Dashboard/Organisms/ReleaseProviderMatrix/ExpandButton States',
  component: ExpandButton,
  parameters: { layout: 'centered' },
  args: {
    isExpanded: false,
    isLoading: false,
    totalTracks: 12,
    onClick: fn(),
  },
} satisfies Meta<typeof ExpandButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the collapsed chevron inside an RTL document. */
export const RtlCollapsed: Story = {
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Expand tracks' })
    ).toHaveAttribute('aria-expanded', 'false');
  },
};

/** Right-to-left: the expanded chevron inside an RTL document. */
export const RtlExpanded: Story = {
  args: { isExpanded: true },
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Collapse tracks' })
    ).toHaveAttribute('aria-expanded', 'true');
  },
};
