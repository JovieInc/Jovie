'use client';

import dynamic from 'next/dynamic';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

type HomepageMarketingImage = {
  readonly publicUrl: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
};

// JOV-1835: `HomepageWorkspaceSection` is the single biggest TBT
// contributor on the homepage in CI. It runs `useScroll` plus 7
// `useTransform` derivations that subscribe to scroll listeners during
// hydration, competing with the above-the-fold hero work for the main
// thread.
//
// Wrapping the import in a client-component shim lets us pass
// `ssr: false` (forbidden in Server Components in Next 15 App Router)
// so the JS chunk and motion subscriptions are deferred until after
// the initial mount.
//
// The placeholder reuses the same outer CSS shell (`.homepage-workspace-section`,
// `__inner`, `__copy`, `homepage-workspace-visual`) so the reserved
// height matches the real component to avoid CLS when the chunk mounts.
// Inner copy uses `visibility: hidden` to preserve layout while keeping
// the a11y tree quiet; the outer section is `aria-hidden`.
const HomepageWorkspaceSectionImpl = dynamic(
  () =>
    import('./HomepageWorkspaceSection').then(m => ({
      default: m.HomepageWorkspaceSection,
    })),
  {
    ssr: false,
    loading: () => (
      <section
        aria-hidden='true'
        data-testid='homepage-workspace-section-placeholder'
        className='homepage-workspace-section'
      >
        <div className='homepage-workspace-section__inner'>
          <div className='homepage-workspace-section__copy'>
            <h2 style={{ visibility: 'hidden' }}>
              {HOMEPAGE_LAUNCH_COPY.workspace.headline.split('\n').map(line => (
                <span key={line}>{line}</span>
              ))}
            </h2>
          </div>
          <div className='homepage-workspace-visual' />
        </div>
      </section>
    ),
  }
);

export function HomepageWorkspaceSectionLazy({
  screenshot,
}: Readonly<{ screenshot: HomepageMarketingImage }>) {
  return <HomepageWorkspaceSectionImpl screenshot={screenshot} />;
}
