import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { buildReleaseShareContext } from '@/lib/share/context';
import type { ShareContext } from '@/lib/share/types';
import { PublicShareActionList, PublicShareMenu } from './PublicShareMenu';

const context = buildReleaseShareContext({
  username: 'timwhite',
  slug: 'midnight-drive',
  title: 'Midnight Drive',
  artistName: 'Tim White',
  artworkUrl: 'https://example.com/artwork.png',
  pathname: '/timwhite/midnight-drive',
});

/**
 * Rendered states of the public share menu. The pill and text triggers live
 * in PublicShareMenu.stories.tsx.
 */
const meta = {
  title: 'Features/Share/PublicShareMenu/States',
  component: PublicShareMenu,
  parameters: { layout: 'padded', themes: { themeOverride: 'dark' } },
  args: { context },
} satisfies Meta<typeof PublicShareMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

function ShareSheetRows({
  shareContext,
}: {
  readonly shareContext: ShareContext;
}) {
  return (
    <div className='w-80 rounded-2xl bg-surface-1 py-2'>
      <PublicShareActionList context={shareContext} drawerHeader='secondary' />
    </div>
  );
}

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

/** Error: the browser refuses the copy, so the sheet explains what failed. */
export const ErrorCopyFailed: Story = {
  beforeEach: function refuseClipboard() {
    const execCommand = document.execCommand;
    stubClipboard(() => Promise.reject(new Error('Clipboard denied')));
    document.execCommand = () => false;
    return function restoreClipboard() {
      Reflect.deleteProperty(navigator, 'clipboard');
      document.execCommand = execCommand;
    };
  },
  render: function ErrorCopyFailedRows(args) {
    return <ShareSheetRows shareContext={args.context} />;
  },
  play: async function copyLinkFails({ canvasElement }) {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Copy Link' }));
    await expect(
      await canvas.findByText('Could not copy the link.')
    ).toBeVisible();
  },
};

/** Partial: the pop-up is blocked, so only the copied text is handed over. */
export const PartialPopupBlocked: Story = {
  beforeEach: function blockPopups() {
    const open = globalThis.open;
    stubClipboard(() => Promise.resolve());
    globalThis.open = () => null;
    return function restorePopups() {
      Reflect.deleteProperty(navigator, 'clipboard');
      globalThis.open = open;
    };
  },
  render: function PartialPopupBlockedRows(args) {
    return <ShareSheetRows shareContext={args.context} />;
  },
  play: async function shareToXBlocked({ canvasElement }) {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'X' }));
    await expect(
      await canvas.findByText(
        'Pop-up blocked. Share text copied so you can post it manually.'
      )
    ).toBeVisible();
  },
};

/** Long content: a long trigger title in the text variant. */
export const LongContentTitle: Story = {
  args: {
    triggerVariant: 'text',
    title: 'Share this extended deluxe edition with everyone you know',
  },
};

/** Right-to-left: an Arabic trigger title in an RTL document. */
export const RtlArabicTitle: Story = {
  args: { title: 'مشاركة' },
  decorators: [
    function RtlDocument(StoryComponent) {
      return (
        <div dir='rtl' lang='ar'>
          <StoryComponent />
        </div>
      );
    },
  ],
};
