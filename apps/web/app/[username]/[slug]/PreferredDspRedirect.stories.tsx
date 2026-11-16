import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PreferredDspRedirect } from './PreferredDspRedirect';

/**
 * The redirect returns null in every state. Stories only mount it with no
 * matching provider link, so a remembered preference can never navigate the
 * Storybook frame away.
 */
const meta = {
  title: 'Release/PreferredDspRedirect',
  component: PreferredDspRedirect,
  parameters: { layout: 'centered' },
  args: {
    providerLinks: [],
    artistHandle: 'tim',
    tracking: {
      contentType: 'release',
      contentId: 'release-1',
      smartLinkSlug: 'never-say-a-word',
    },
  },
} satisfies Meta<typeof PreferredDspRedirect>;

export default meta;

/** No provider links for this release: the SmartLink page stays in place. */
export const EmptyProviderLinks: StoryObj<typeof PreferredDspRedirect> = {
  render: args => (
    <div className='min-h-40 bg-base p-8 text-primary-token'>
      <p className='text-sm'>
        The redirect mounts with no visible chrome. With no provider link to
        match, the visitor stays on the SmartLink page.
      </p>
      <PreferredDspRedirect {...args} />
    </div>
  ),
};
