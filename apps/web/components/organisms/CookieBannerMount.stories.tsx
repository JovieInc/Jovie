import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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
