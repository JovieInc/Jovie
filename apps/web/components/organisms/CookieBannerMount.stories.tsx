import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { blockStoredConsentRead } from '@/.storybook/cookie-consent-mock';
import { CookieBannerMount } from './CookieBannerMount';

const meta = {
  title: 'Organisms/CookieBannerMount',
  component: CookieBannerMount,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-96 space-y-2 rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-secondary-token'>
        <p className='font-medium text-primary-token'>
          Cookie consent mount point
        </p>
        <p>
          Lazily loads the compact consent banner (
          <code>CookieBannerSection</code>) only when the required-cookie flag
          is set and no local consent decision exists yet, and lazily loads the
          preferences <code>CookieModal</code> on demand via{' '}
          <code>window.JVConsent.openModal()</code>. In this Storybook
          environment neither cookie/localStorage state is present, so no banner
          mounts, so the empty render below is the true default state.
        </p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CookieBannerMount>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * The browser blocks site storage, so reading the saved consent choice throws.
 * The mount fails closed: it cannot prove a choice was made, so it lazily
 * mounts the consent banner instead of silently skipping it.
 */
export const ErrorStorageBlocked: Story = {
  beforeEach: () => {
    document.cookie = 'jv_cc_required=1; path=/';
    const restoreStorage = blockStoredConsentRead();
    return () => {
      restoreStorage();
      document.cookie = 'jv_cc_required=; Max-Age=0; path=/';
      document.documentElement.style.removeProperty('--cookie-banner-h');
    };
  },
  play: async ({ canvasElement }) => {
    const banner = await within(canvasElement.ownerDocument.body).findByTestId(
      'cookie-banner'
    );
    await expect(
      within(banner).getByRole('button', { name: 'Reject all' })
    ).toBeVisible();
  },
};
