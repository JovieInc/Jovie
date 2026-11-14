import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { SignInPageClient } from './SignInPageClient';

/**
 * Storybook's next/navigation stand-in hands every component one shared,
 * mutable URLSearchParams, and per-story nextjs.navigation.query never reaches
 * it. This decorator writes the story's query into that shared instance before
 * the page renders and removes it again on unmount, so stories stay isolated
 * when they mount one at a time. Autodocs mounts every story on one page at
 * once, where the shared query would leak between them, so this file opts out
 * of autodocs (see meta tags).
 */
function WithSignInQuery({
  query,
  children,
}: Readonly<{ query: string; children: ReactNode }>) {
  const searchParams = useSearchParams() as unknown as URLSearchParams;
  const [entries] = useState(() => {
    const next = [...new URLSearchParams(query)];
    for (const [key, value] of next) searchParams.set(key, value);
    return next;
  });
  useEffect(() => {
    for (const [key, value] of entries) searchParams.set(key, value);
    return () => {
      for (const [key] of entries) searchParams.delete(key);
    };
  }, [entries, searchParams]);
  return children;
}

const withQuery = (query: string) => [
  (Story: () => ReactNode) => (
    <WithSignInQuery query={query}>
      <Story />
    </WithSignInQuery>
  ),
];

const meta = {
  title: 'Auth/SignInPageClient',
  component: SignInPageClient,
  tags: ['!autodocs'],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/signin' } },
  },
} satisfies Meta<typeof SignInPageClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The pricing hand-off: the plan recap sits above the providers. */
export const WithOfferSummary: Story = {
  args: { showOfferSummary: true },
  decorators: withQuery('plan=pro&interval=month'),
};

/** A provider returned a failure code (here a state mismatch). */
export const ErrorProviderStateMismatch: Story = {
  decorators: withQuery('error=state_mismatch'),
};

/** The visitor declined the provider's consent screen. */
export const PermissionDeniedProviderConsent: Story = {
  decorators: withQuery('error=access_denied'),
};

/** Long content: the longest email the prefill accepts (64-character local part). */
export const LongContentPrefilledEmail: Story = {
  decorators: withQuery(
    `email=${encodeURIComponent(`${'a'.repeat(64)}@${'long-label'.repeat(5)}.example.com`)}`
  ),
};

/** Right-to-left: the page inside an Arabic document direction. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
