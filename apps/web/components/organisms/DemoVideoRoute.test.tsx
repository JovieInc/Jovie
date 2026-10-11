import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DemoVideoPage } from '@/components/features/demo/DemoVideoPage';
import demoVideoMeta, {
  Web028DemoVideo,
  Web029DemoVideoAlias,
} from './DemoVideoRoute.stories';

const DEMO_VIDEO_STORY_PATH =
  'apps/web/components/organisms/DemoVideoRoute.stories.tsx';
const DEMO_VIDEO_STORY_FIRST_CONTAINING_SHA =
  '00895196e53b823bb0311193b4af29f67b8849c1';

vi.mock('@/components/features/demo/DemoVideoPlayer', () => ({
  DemoVideoPlayer: ({
    captionsUrl,
    label,
    videoUrl,
  }: {
    captionsUrl: string;
    label: string;
    videoUrl: string;
  }) => (
    <div
      data-testid='demo-video-player'
      data-captions-url={captionsUrl}
      data-label={label}
      data-video-url={videoUrl}
    />
  ),
}));

describe('DemoVideoPage route contract', () => {
  it('renders no product demo surface while certification is incomplete', () => {
    const { container } = render(<DemoVideoPage />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('demo-video-player')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Download demo' })
    ).not.toBeInTheDocument();
  });

  it('keeps the unmapped production CTA free of a false Pen identity', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'components/features/demo/DemoVideoPage.tsx'),
      'utf8'
    );

    // primary/md has no source-backed Pen master yet; the contract fails
    // closed instead of stamping another master's root.
    expect(source).not.toContain('data-pen-contract');
  });

  it('binds both route identities to one exact component and no counter body', () => {
    const demoRoute = readFileSync(
      resolve(process.cwd(), 'app/(marketing)/demo/video/page.tsx'),
      'utf8'
    );
    const aliasRoute = readFileSync(
      resolve(process.cwd(), 'app/(marketing)/demovideo/page.tsx'),
      'utf8'
    );

    for (const source of [demoRoute, aliasRoute]) {
      expect(source).toContain(
        "import { DemoVideoPage } from '@/features/demo/DemoVideoPage';"
      );
      expect(source).toContain('return <DemoVideoPage />;');
      expect(source).toContain('robots: NOINDEX_ROBOTS');
      expect(source).toContain('export const revalidate = false');
    }

    expect(demoVideoMeta.component).toBe(DemoVideoPage);
    expect(demoVideoMeta.parameters.pen).toEqual({
      registryIds: ['web-028-demo--video', 'web-029-demovideo'],
      routes: ['/demo/video', '/demovideo'],
      source: 'apps/web/components/features/demo/DemoVideoPage.tsx',
      sourceExport: 'DemoVideoPage',
      sourceSha: DEMO_VIDEO_STORY_FIRST_CONTAINING_SHA,
      implementation: 'exact-production-component',
    });
    expect(Web028DemoVideo.parameters?.pen).toEqual({
      registryId: 'web-028-demo--video',
      route: '/demo/video',
      storyExport: 'Web028DemoVideo',
    });
    expect(Web029DemoVideoAlias.parameters?.pen).toEqual({
      registryId: 'web-029-demovideo',
      route: '/demovideo',
      storyExport: 'Web029DemoVideoAlias',
    });
  });

  it('gives both aliases the shared marketing document-scroll context', () => {
    expect(demoVideoMeta.decorators).toHaveLength(1);
    expect(Web028DemoVideo.decorators).toBeUndefined();
    expect(Web029DemoVideoAlias.decorators).toBeUndefined();

    const decorate = demoVideoMeta.decorators[0];
    const decoratedStory = decorate(() => <div data-testid='story-body' />);

    const { container } = render(decoratedStory);
    const routeContext = container.firstElementChild;

    expect(routeContext).toHaveClass(
      'system-b-marketing',
      'dark',
      'min-h-svh',
      'overflow-x-clip',
      'bg-base',
      'text-primary-token'
    );
    expect(routeContext).not.toHaveClass(
      'h-svh',
      'overflow-hidden',
      'overflow-y-hidden'
    );
    expect(screen.getByTestId('story-body')).toBeInTheDocument();
  });

  it('binds its receipt to an ancestor commit containing the source and story exports', () => {
    const receipt = demoVideoMeta.parameters.pen;
    const storyExport = Web028DemoVideo.parameters?.pen.storyExport;

    expect(receipt.sourceSha).toMatch(/^[0-9a-f]{40}$/);
    expect(storyExport).toBe('Web028DemoVideo');

    try {
      execFileSync('git', ['cat-file', '-e', `${receipt.sourceSha}^{commit}`], {
        stdio: 'pipe',
      });
    } catch {
      expect(
        execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
          encoding: 'utf8',
        }).trim()
      ).toBe('true');
      return;
    }

    expect(() =>
      execFileSync(
        'git',
        ['merge-base', '--is-ancestor', receipt.sourceSha, 'HEAD'],
        { stdio: 'pipe' }
      )
    ).not.toThrow();

    const sourceAtReceipt = execFileSync(
      'git',
      ['show', `${receipt.sourceSha}:${receipt.source}`],
      { encoding: 'utf8' }
    );
    const storyAtReceipt = execFileSync(
      'git',
      ['show', `${receipt.sourceSha}:${DEMO_VIDEO_STORY_PATH}`],
      { encoding: 'utf8' }
    );

    expect(sourceAtReceipt).toContain(
      `export function ${receipt.sourceExport}`
    );
    expect(storyAtReceipt).toContain(`export const ${storyExport}`);
  });

  it('uses the canonical primary CTA without a deprecated button alias', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'components/features/demo/DemoVideoPage.tsx'),
      'utf8'
    );

    expect(source).toMatch(
      /variant\s*=\s*(?:['"]primary['"]|\{\s*['"]primary['"]\s*\})/
    );
    expect(source).not.toMatch(
      /variant\s*=\s*(?:['"]whitePill['"]|\{\s*['"]whitePill['"]\s*\})/
    );
  });
});
