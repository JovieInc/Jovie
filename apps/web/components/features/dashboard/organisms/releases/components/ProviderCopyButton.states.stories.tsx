import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ProviderCopyButton } from './ProviderCopyButton';

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
    'Features/Dashboard/Organisms/Releases/Components/ProviderCopyButton States',
  component: ProviderCopyButton,
  parameters: { layout: 'centered' },
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

/** Empty: without a tracked path there is nothing to copy. */
export const EmptyNoPath: Story = {
  args: { path: undefined },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', {
      name: 'Detected',
    });
    await expect(button).not.toHaveAttribute('data-url');
    await userEvent.click(button);
    await expect(args.onCopy).not.toHaveBeenCalled();
  },
};

/** Long content: long names go to the copy label; the button stays one line. */
export const LongContentReleaseTitle: Story = {
  args: {
    releaseTitle: LONG_TITLE,
    providerLabel: 'An Extraordinarily Long Streaming Provider Name',
    isManual: true,
  },
  decorators: [withNarrowCell],
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Custom' })
    );
    await expect(args.onCopy).toHaveBeenCalledWith(
      '/r/midnight-signal?utm_source=spotify',
      `${LONG_TITLE} – An Extraordinarily Long Streaming Provider Name`,
      'copy-spotify-release-1'
    );
  },
};

/** Right-to-left: the copied confirmation inside an RTL document. */
export const RtlCopied: Story = {
  args: { isCopied: true },
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Copied!' })
    ).toBeVisible();
  },
};
