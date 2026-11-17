import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { PublicPageErrorFallback } from './PublicPageErrorFallback';

/**
 * Rendered states of the public-page error fallback. The visible copy is
 * fixed; stories vary the error digest and the document direction.
 */
function withFullHeight(Story: () => ReactNode) {
  return (
    <div className='flex min-h-screen'>
      <Story />
    </div>
  );
}

function withRtl(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar' className='flex min-h-screen'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Providers/PublicPageErrorFallback States',
  component: PublicPageErrorFallback,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withFullHeight],
  args: {
    context: 'LandingPage',
    onRefresh: () => undefined,
  },
} satisfies Meta<typeof PublicPageErrorFallback>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: a render failure with a support digest behind the disclosure. */
export const ErrorWithDigest: Story = {
  args: {
    error: Object.assign(new Error('The landing page failed to render.'), {
      digest: 'public-page-timeout',
    }),
  },
};

/** Partial: the error carries no digest, so there is no disclosure. */
export const PartialWithoutDigest: Story = {
  args: {
    error: new Error('The profile page failed to render.'),
    context: 'Profile',
  },
};

/** Long content: a long digest wraps inside the diagnostics disclosure. */
export const LongContentDigest: Story = {
  args: {
    error: Object.assign(new Error('The landing page failed to render.'), {
      digest:
        'public-page-timeout-3f9c2a7b1e4d8c6a0b5f2e9d7c1a3b8e4f6d2c9a7e1b5d3f',
    }),
  },
};

/** RTL: the fallback in a right-to-left document. */
export const RtlDocument: Story = {
  args: {
    error: Object.assign(new Error('The landing page failed to render.'), {
      digest: 'public-page-timeout',
    }),
  },
  decorators: [withRtl],
};
