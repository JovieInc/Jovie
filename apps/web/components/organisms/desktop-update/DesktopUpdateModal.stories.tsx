import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DesktopUpdatePhase } from '@/lib/desktop/desktop-updates';
import { DesktopUpdateModalView } from './DesktopUpdateModal';

const AVAILABLE: DesktopUpdatePhase = {
  state: 'available',
  version: '26.9.16',
  releaseDate: '2026-09-27T00:00:00.000Z',
  notesUrl: 'https://jov.ie/changelog',
};

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
    loading: false,
  },
} satisfies Meta<typeof DesktopUpdateModalView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Available: Story = { args: { state: AVAILABLE } };

export const AvailableLoadingNotes: Story = {
  args: { state: AVAILABLE, notes: null, loading: true },
};

export const AvailableFallbackLink: Story = {
  args: { state: AVAILABLE, notes: null },
};

export const Downloading: Story = {
  args: {
    state: {
      state: 'downloading',
      percent: 42,
      transferredBytes: 96 * 1024 * 1024,
      totalBytes: 229 * 1024 * 1024,
      bytesPerSecond: 14 * 1024 * 1024,
    },
    version: '26.9.16',
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

export const ErrorNotRetryable: Story = {
  args: {
    state: {
      state: 'error',
      message: 'code signature mismatch',
      retryable: false,
    },
  },
};

export const AvailableLongNotes: Story = {
  args: {
    state: AVAILABLE,
    notes: {
      summary: 'Touch ID sign-in, a steadier release pipeline and table fixes.',
      items: Array.from(
        { length: 14 },
        (_, i) => `Release note line ${i + 1} with enough words to wrap once`
      ),
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
