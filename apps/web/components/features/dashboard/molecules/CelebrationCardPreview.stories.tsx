import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import { CelebrationCardPreview } from './CelebrationCardPreview';

type ShareFn = Navigator['share'] | undefined;

function setShare(share: ShareFn) {
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    writable: true,
    value: share,
  });
}

function withShare(Story: () => React.JSX.Element) {
  setShare(async () => {});
  return <Story />;
}

function withoutShare(Story: () => React.JSX.Element) {
  setShare(undefined);
  return <Story />;
}

function withFailingFetch(Story: () => React.JSX.Element) {
  setShare(async () => {});
  globalThis.fetch = () => Promise.reject(new Error('Download failed'));
  return <Story />;
}

function withOfflineFetch(Story: () => React.JSX.Element) {
  setShare(async () => {});
  globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  return <Story />;
}

async function pressDownload({
  canvasElement,
}: {
  canvasElement: HTMLElement;
}) {
  await userEvent.click(
    within(canvasElement).getByRole('button', { name: 'Download' })
  );
}

const meta = {
  title: 'Dashboard/Molecules/CelebrationCardPreview',
  component: CelebrationCardPreview,
  parameters: { layout: 'centered' },
  decorators: [withShare],
  args: { username: 'sashawaves' },
} satisfies Meta<typeof CelebrationCardPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const EmptyUsername: Story = { args: { username: '' } };

export const ErrorDownloadFailed: Story = {
  decorators: [withFailingFetch],
  play: pressDownload,
};

export const OfflineDownloadFails: Story = {
  decorators: [withOfflineFetch],
  play: pressDownload,
};

export const PartialDownloadOnly: Story = { decorators: [withoutShare] };

export const LongContentUsername: Story = {
  args: {
    username: 'the-extraordinarily-long-named-midnight-orchestra-official',
  },
};

export const RtlUsername: Story = { args: { username: 'فرقة-منتصف-الليل' } };
