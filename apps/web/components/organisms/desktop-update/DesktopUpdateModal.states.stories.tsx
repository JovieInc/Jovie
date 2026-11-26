import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DesktopUpdatePhase } from '@/lib/desktop/desktop-updates';
import { DesktopUpdateModalView } from './DesktopUpdateModal';

const AVAILABLE: DesktopUpdatePhase = {
  state: 'available',
  version: '26.9.16',
  releaseDate: '2026-09-27T00:00:00.000Z',
  notesUrl: 'https://jov.ie/changelog',
};

/** Rendered states of the update modal that the base stories do not name. */
const meta = {
  title: 'Organisms/DesktopUpdateModal/States',
  component: DesktopUpdateModalView,
  parameters: { layout: 'centered' },
  args: {
    open: true,
    onDownload: () => undefined,
    onInstall: () => undefined,
    onRetry: () => undefined,
    onLater: () => undefined,
    notes: null,
    loading: false,
  },
} satisfies Meta<typeof DesktopUpdateModalView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: release notes are still being fetched. */
export const LoadingReleaseNotes: Story = {
  args: { state: AVAILABLE, loading: true },
};

/** Empty: no notes came back, so the modal links to the changelog. */
export const EmptyReleaseNotes: Story = {
  args: { state: AVAILABLE, notes: { summary: '', items: [] } },
};

/** Partial: the download size is unknown, so progress is indeterminate. */
export const PartialDownloadUnknownSize: Story = {
  args: {
    state: {
      state: 'downloading',
      percent: 0,
      transferredBytes: 0,
      totalBytes: 0,
      bytesPerSecond: 0,
    },
    version: '26.9.16',
  },
};

/** Long content: many long release-note items inside the scroll region. */
export const LongContentReleaseNotes: Story = {
  args: {
    state: AVAILABLE,
    notes: {
      summary:
        'A long summary of the release that goes on across several lines so the notes region has to scroll instead of growing the dialog past the viewport.',
      items: Array.from(
        { length: 8 },
        (_, index) =>
          `Improvement ${index + 1}: release cards, the sidebar and the audio dock now stay in sync in the background without blocking the window.`
      ),
    },
  },
};
