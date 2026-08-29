import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useTheme } from 'next-themes';
import { type ReactNode, useEffect } from 'react';
import { MarketingBentoSection } from './MarketingBentoSection';
import { MarketingPageShell } from './MarketingPageShell';

function StoryTheme({
  children,
  theme,
}: {
  readonly children: ReactNode;
  readonly theme: 'dark' | 'light';
}) {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(theme);
    return () => setTheme('dark');
  }, [setTheme, theme]);

  return children;
}

function ReleaseWorkflowPreview() {
  return (
    <div
      className='flex h-full flex-col justify-end gap-3 p-5'
      aria-hidden='true'
    >
      <div className='rounded-lg border border-subtle bg-surface-1 p-4 shadow-card'>
        <p className='text-xs font-semibold text-primary-token'>
          Midnight Drive
        </p>
        <p className='marketing-bento-section__tertiary mt-1 font-mono text-3xs'>
          JAN 15 · READY
        </p>
      </div>
      <div className='grid grid-cols-2 gap-2'>
        <span className='h-16 rounded-md border border-subtle bg-surface-1' />
        <span className='h-16 rounded-md border border-subtle bg-surface-2' />
      </div>
    </div>
  );
}

function AdaptiveProfilePreview() {
  return (
    <div className='grid h-full place-items-center p-5' aria-hidden='true'>
      <div className='w-full max-w-64 rounded-lg border border-subtle bg-surface-1 p-4 shadow-card'>
        <p className='text-xs font-semibold text-primary-token'>Jordan Lee</p>
        <p className='marketing-bento-section__tertiary mt-1 text-3xs'>
          Midnight Drive
        </p>
        <div className='marketing-bento-section__secondary mt-4 rounded-full border border-subtle bg-surface-2 px-3 py-2 text-center text-3xs font-medium'>
          Listen now
        </div>
      </div>
    </div>
  );
}

function ReleaseSignalPreview() {
  return (
    <div className='space-y-2 p-5' aria-hidden='true'>
      {['Release matched', 'Profile updated', 'Fans notified'].map(
        (label, index) => (
          <div
            key={label}
            className='flex items-center justify-between gap-3 rounded-md border border-subtle bg-surface-1 px-3 py-2.5'
          >
            <span className='marketing-bento-section__secondary text-xs'>
              {label}
            </span>
            <span className='marketing-bento-section__tertiary font-mono text-3xs'>
              0{index + 1}
            </span>
          </div>
        )
      )}
    </div>
  );
}

function FanActivityPreview() {
  return (
    <div className='grid h-full content-end gap-3 p-5' aria-hidden='true'>
      {[
        ['New York', 'Release page'],
        ['Los Angeles', 'Direct'],
        ['London', 'Social'],
      ].map(([city, source]) => (
        <div
          key={city}
          className='flex items-center justify-between gap-4 border-b border-subtle pb-3 text-xs last:border-b-0'
        >
          <span className='marketing-bento-section__secondary'>{city}</span>
          <span className='marketing-bento-section__tertiary font-mono text-3xs'>
            {source}
          </span>
        </div>
      ))}
    </div>
  );
}

const defaultArgs = {
  eyebrow: 'Inside Jovie',
  title: 'Your release work, connected.',
  titleId: 'marketing-bento-story-title',
  description:
    'Keep releases, profiles, and fan activity in one place, then act on what matters next.',
  featuredStart: {
    id: 'release-workflow',
    title: 'Know what ships next',
    body: 'See the release date, artwork, links, and remaining work without rebuilding the plan in another tool.',
    preview: <ReleaseWorkflowPreview />,
    previewLabel: 'Release workflow preview',
    action: { href: '/start', label: 'Start with Jovie' },
  },
  supportingTop: {
    id: 'adaptive-profile',
    title: 'One profile for every fan',
    body: 'Show the release, link, or action that fits why each fan arrived.',
    preview: <AdaptiveProfilePreview />,
    previewLabel: 'Adaptive artist profile preview',
    previewAspect: 'landscape' as const,
  },
  supportingBottom: {
    id: 'release-signals',
    title: 'Signals worth acting on',
    body: 'Keep the next useful release decision visible without adding another dashboard.',
    preview: <ReleaseSignalPreview />,
    previewLabel: 'Release signal list preview',
    previewAspect: 'landscape' as const,
  },
  featuredEnd: {
    id: 'fan-context',
    title: 'Keep every fan close',
    body: 'Carry the context behind each visit into the next release instead of losing it between campaigns.',
    preview: <FanActivityPreview />,
    previewLabel: 'Fan activity preview',
    previewAspect: 'square' as const,
    action: { href: '/artist-profiles', label: 'Explore artist profiles' },
  },
};

const meta = {
  title: 'Marketing/Primitives/MarketingBentoSection',
  component: MarketingBentoSection,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story, context) => {
      const storyTheme =
        context.parameters.jovieTheme === 'light' ? 'light' : 'dark';

      return (
        <StoryTheme theme={storyTheme}>
          <MarketingPageShell className='min-h-screen bg-page'>
            <Story />
          </MarketingPageShell>
        </StoryTheme>
      );
    },
  ],
  args: defaultArgs,
} satisfies Meta<typeof MarketingBentoSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = {};

export const Light: Story = {
  parameters: {
    jovieTheme: 'light',
    backgrounds: { default: 'light' },
  },
};

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};

export const WithoutPreviews: Story = {
  args: {
    featuredStart: {
      id: 'release-workflow-copy-only',
      title: 'Know what ships next',
      body: 'See the release date, artwork, links, and remaining work in one quiet view.',
      action: { href: '/start', label: 'Start with Jovie' },
    },
    supportingTop: {
      id: 'adaptive-profile-copy-only',
      title: 'One profile for every fan',
      body: 'Show the release, link, or action that fits why each fan arrived.',
    },
    supportingBottom: {
      id: 'release-signals-copy-only',
      title: 'Signals worth acting on',
      body: 'Keep the next useful release decision visible.',
    },
    featuredEnd: {
      id: 'fan-context-copy-only',
      title: 'Keep every fan close',
      body: 'Carry useful fan context into the next release.',
      action: { href: '/artist-profiles', label: 'Explore artist profiles' },
    },
  },
};
