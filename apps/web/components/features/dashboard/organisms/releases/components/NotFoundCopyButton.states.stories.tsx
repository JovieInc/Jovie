import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NotFoundCopyButton } from './NotFoundCopyButton';

const LONG_TITLE =
  'Midnight Signal (Extended Orchestral Reprise with the Northern Coastline Choir) [Deluxe Anniversary Edition]';

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const withNarrowCell: Decorator = Story => (
  <div className='w-24 overflow-hidden'>
    <Story />
  </div>
);

const meta = {
  title:
    'Features/Dashboard/Organisms/Releases/Components/NotFoundCopyButton States',
  component: NotFoundCopyButton,
  parameters: { layout: 'centered' },
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

/** Empty: the provider link is missing, so the cell shows a dash. */
export const EmptyMissingLink: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('—')).toBeVisible();
  },
};

/** Long content: a long title goes to the copy label; the button stays one line. */
export const LongContentReleaseTitle: Story = {
  args: { releaseTitle: LONG_TITLE, isCopied: true },
  decorators: [withNarrowCell],
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'));
    await expect(args.onCopy).toHaveBeenCalledWith(
      '/r/midnight-signal',
      `${LONG_TITLE} smart link`,
      'copy-not-found-release-1'
    );
  },
};

/** Right-to-left: the copied confirmation inside an RTL document. */
export const RtlCopied: Story = {
  args: { isCopied: true },
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Copied!')).toBeVisible();
  },
};
