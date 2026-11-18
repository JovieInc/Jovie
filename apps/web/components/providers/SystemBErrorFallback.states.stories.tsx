import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { SystemBErrorFallback } from './SystemBErrorFallback';

/**
 * Rendered states of the shared error fallback. Each story changes only the
 * caller-owned copy, digest, action or document direction.
 */
function FullHeightFrame({ children }: { readonly children: ReactNode }) {
  return <div className='flex min-h-screen'>{children}</div>;
}

function withFullHeight(Story: () => ReactNode) {
  return (
    <FullHeightFrame>
      <Story />
    </FullHeightFrame>
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
  title: 'Providers/SystemBErrorFallback States',
  component: SystemBErrorFallback,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withFullHeight],
  args: {
    description: 'Try again in a moment.',
    action: {
      type: 'button',
      label: 'Try again',
      onClick: () => undefined,
    },
  },
} satisfies Meta<typeof SystemBErrorFallback>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the default recovery view with a retry action and a digest. */
export const ErrorWithDigest: Story = {
  args: {
    digest: 'dashboard-timeout',
    role: 'alert',
    ariaLive: 'assertive',
  },
};

/** Partial: no digest, so the diagnostics disclosure is left out. */
export const PartialWithoutDigest: Story = {
  args: {
    description: 'This page moved. Head back home.',
    action: { type: 'link', label: 'Go home', href: '/' },
    ariaLive: 'polite',
  },
};

/** Long content: a long title, description and digest wrap inside the card. */
export const LongContentCopy: Story = {
  args: {
    title:
      'Something went wrong while loading this workspace and every one of its releases',
    description:
      'The page could not finish loading because one of the services it depends on did not answer in time. Your work is saved. Try again in a moment, and if it keeps happening, share the error details below with support so the team can trace it.',
    digest: 'dashboard-timeout-3f9c2a7b1e4d8c6a0b5f2e9d7c1a3b8e4f6d2c9a',
    role: 'alert',
  },
};

/** RTL: Arabic copy in a right-to-left document. */
export const RtlArabic: Story = {
  args: {
    title: 'حدث خطأ ما',
    description: 'حاول مرة أخرى بعد قليل.',
    digest: 'dashboard-timeout',
    action: {
      type: 'button',
      label: 'حاول مرة أخرى',
      onClick: () => undefined,
    },
    role: 'alert',
  },
  decorators: [withRtl],
};
