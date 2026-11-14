import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PreserveSearchRedirect } from './PreserveSearchRedirect';

/**
 * The pre-redirect paint. Each story targets the frame's own URL, which is the
 * already-on-target path, so the redirect never navigates Storybook away.
 */
const meta = {
  title: 'Release/PreserveSearchRedirect',
  component: PreserveSearchRedirect,
  parameters: { layout: 'fullscreen' },
  args: { href: '/' },
  render: () => (
    <PreserveSearchRedirect href={globalThis.location?.pathname ?? '/'} />
  ),
} satisfies Meta<typeof PreserveSearchRedirect>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The shared SmartLink loading shell while the query-preserving hop runs. */
export const Loading: Story = {};
