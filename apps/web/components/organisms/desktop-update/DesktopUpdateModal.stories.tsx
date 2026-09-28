import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DesktopUpdateModalView } from './DesktopUpdateModal';

const NOTES_URL = 'https://jov.ie/changelog';

const meta = {
  title: 'Organisms/DesktopUpdateModal',
  component: DesktopUpdateModalView,
  parameters: { layout: 'centered' },
  args: {
    open: true,
    onDownload: () => undefined,
    onInstall: () => undefined,
    onRetry: () => undefined,
    onLater: () => undefined,
    notes: {
      summary: 'Faster release sync and a calmer sidebar.',
      items: ['Release cards now sync in the background', 'New audio dock'],
    },
    notesLoading: false,
  },
} satisfies Meta<typeof DesktopUpdateModalView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Available: Story = {
  args: {
    state: {
      state: 'available',
      version: '26.9.16',
      releaseDate: '2026-09-27T00:00:00.000Z',
      notesUrl: NOTES_URL,
    },
  },
};

// loading state: notes are still streaming in, so the body renders nothing
// under the title until they resolve.
export const AvailableLoadingNotes: Story = {
  args: {
    state: {
      state: 'available',
      version: '26.9.16',
      releaseDate: '2026-09-27T00:00:00.000Z',
      notesUrl: NOTES_URL,
    },
    notes: null,
    notesLoading: true,
  },
};

export const AvailableFallbackLink: Story = {
  args: {
    state: {
      state: 'available',
      version: '26.9.16',
      releaseDate: '2026-09-27T00:00:00.000Z',
      notesUrl: NOTES_URL,
    },
    notes: null,
  },
};

export const Downloading: Story = {
  args: {
    state: {
      state: 'downloading',
      percent: 42,
      transferredBytes: 42_000_000,
      totalBytes: 100_000_000,
      bytesPerSecond: 1_000_000,
    },
  },
};

export const Ready: Story = {
  args: { state: { state: 'ready', version: '26.9.16' } },
};

export const ErrorState: Story = {
  args: {
    state: {
      state: 'error',
      message: 'net::ERR_CONNECTION_REFUSED',
      retryable: true,
    },
  },
};

export const AvailableLight: Story = {
  ...Available,
  parameters: { themes: { themeOverride: 'light' } },
};

export const ReadyLight: Story = {
  ...Ready,
  parameters: { themes: { themeOverride: 'light' } },
};
