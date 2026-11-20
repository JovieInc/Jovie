import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ProviderCopyButton } from './ProviderCopyButton';

const meta = {
  title: 'Features/Dashboard/Organisms/Releases/Components/ProviderCopyButton',
  component: ProviderCopyButton,
  parameters: {
    layout: 'centered',
    // The matcher sees the nested onCopy callback's label parameter as a prop.
    // Detected's play verifies that callback argument instead.
    jovie: { uncoveredProps: ['label'] },
  },
  args: {
    testId: 'copy-spotify-release-1',
    path: '/r/midnight-signal?utm_source=spotify',
    releaseTitle: 'Midnight Signal',
    providerLabel: 'Spotify',
    isCopied: false,
    isManual: false,
    onCopy: fn().mockResolvedValue(undefined),
  },
} satisfies Meta<typeof ProviderCopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Detected: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Detected' })
    );
    await expect(args.onCopy).toHaveBeenCalledWith(
      args.path,
      `${args.releaseTitle} – ${args.providerLabel}`,
      args.testId
    );
  },
};
export const Manual: Story = { args: { isManual: true } };
export const Copied: Story = { args: { isCopied: true } };
export const MissingPath: Story = { args: { path: undefined } };
