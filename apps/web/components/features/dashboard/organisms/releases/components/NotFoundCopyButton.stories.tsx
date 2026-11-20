import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NotFoundCopyButton } from './NotFoundCopyButton';

const meta = {
  title: 'Features/Dashboard/Organisms/Releases/Components/NotFoundCopyButton',
  component: NotFoundCopyButton,
  parameters: {
    layout: 'centered',
    // These are nested onCopy parameters, verified by Missing's play.
    jovie: { uncoveredProps: ['path', 'label'] },
  },
  args: {
    testId: 'copy-not-found-release-1',
    releaseTitle: 'Midnight Signal',
    smartLinkPath: '/r/midnight-signal',
    isCopied: false,
    onCopy: fn().mockResolvedValue(undefined),
  },
} satisfies Meta<typeof NotFoundCopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Missing: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'));
    await expect(args.onCopy).toHaveBeenCalledWith(
      args.smartLinkPath,
      `${args.releaseTitle} smart link`,
      args.testId
    );
  },
};
export const Copied: Story = { args: { isCopied: true } };
