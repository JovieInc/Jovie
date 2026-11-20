import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SupportPageContent } from './SupportPageContent';
import { SUPPORT_STORY_RECEIPT } from './SupportPageContent.stories';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  page: vi.fn(),
}));

describe('SupportPageContent', () => {
  it('renders the shipped body in hero, channels, CTA order', () => {
    const { container } = render(<SupportPageContent />);

    const heading = screen.getByRole('heading', {
      level: 1,
      name: "We're here to help.",
    });
    expect(heading).toBeVisible();
    // Compact route title owner ("type 28/620"): one shared class, no
    // per-breakpoint Tailwind size ramp on the route.
    expect(heading).toHaveClass(
      'system-b-marketing-route-title',
      'text-primary-token'
    );
    // No eyebrow label above the one H1.
    expect(heading.previousElementSibling).toBeNull();
    for (const residue of [
      'text-4xl',
      'sm:text-5xl',
      'lg:text-6xl',
      'font-semibold',
      'tracking-tight',
    ]) {
      expect(heading).not.toHaveClass(residue);
    }
    expect(screen.getByTestId('marketing-section-hero')).toHaveAttribute(
      'aria-labelledby',
      'support-hero-heading'
    );
    const sectionHeadings = Array.from(container.querySelectorAll('section'))
      .map(section => section.querySelector('h1, h2')?.textContent?.trim())
      .filter((heading): heading is string => heading !== undefined);

    expect(sectionHeadings).toEqual([
      "We're here to help.",
      'How Can We Help?',
      'Prefer Email?',
    ]);
    // Matte list, not icon tiles: no cards, no decorative icons beside titles.
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    const channels = screen.getByTestId('marketing-section-content-prose');
    expect(within(channels).getAllByRole('listitem')).toHaveLength(2);
    for (const item of within(channels).getAllByRole('listitem')) {
      expect(item.querySelectorAll('svg')).toHaveLength(1);
      expect(item.querySelector('a svg')).not.toBeNull();
    }
    expect(container.querySelector('.text-accent')).toBeNull();
    // No texture image or accent wash behind the hero.
    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero.querySelector('img')).toBeNull();
    expect(hero.querySelector('.marketing-route-hero__accent')).toBeNull();
    expect(screen.getAllByTestId('marketing-section-cta')).toHaveLength(1);
    for (const action of screen
      .getAllByRole('link')
      .filter(link =>
        /^(Browse the Help Center|Contact support)$/.test(
          link.textContent?.trim() ?? ''
        )
      )) {
      // Canonical 28px marketing Button atom; it owns the 44px touch target.
      expect(action).toHaveAttribute('data-size', 'marketing');
      expect(action).toHaveClass('h-auto', 'min-h-7', 'rounded-full');
      expect(action).toHaveClass(
        'before:h-full',
        'before:min-h-11',
        'before:min-w-11'
      );
      for (const fixedHeight of ['h-7', 'h-11', 'h-11!', 'h-12']) {
        expect(action).not.toHaveClass(fixedHeight);
      }
      expect(action).not.toHaveClass('public-action-inline');
    }
  });

  it('routes self-serve to the canonical Help Center and keeps contact as the fallback', () => {
    render(<SupportPageContent />);

    expect(
      screen.getByRole('link', { name: /browse the help center/i })
    ).toHaveAttribute('href', 'https://docs.jov.ie/docs');
    // One contact action, not a repeat of it in a second section.
    expect(
      screen.getByRole('link', { name: /contact support/i })
    ).toHaveAttribute('href', 'https://docs.jov.ie/contact?from=/support');
    // Direct email remains a usable fallback when the Help Center is unreachable.
    expect(
      screen.getByRole('link', { name: 'support@jov.ie' })
    ).toHaveAttribute('href', 'mailto:support@jov.ie');
    // No duplicate Help Center corpus: the page no longer renders the FAQ
    // accordion that now lives at docs.jov.ie/docs/manage-jovie/troubleshooting.
    expect(
      screen.queryByRole('button', { name: /how do i/i })
    ).not.toBeInTheDocument();
  });

  it('keeps metadata and schema ownership in the route and binds the exact story', () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), 'app/(marketing)/support/page.tsx'),
      'utf8'
    );
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/SupportPageContent.stories.tsx'
      ),
      'utf8'
    );

    expect(routeSource).toContain('export const metadata: Metadata');
    expect(routeSource).toContain('export const revalidate = false');
    expect(routeSource).toContain('buildBreadcrumbSchema');
    expect(routeSource.match(/type='application\/ld\+json'/g)).toHaveLength(1);
    expect(routeSource).not.toContain('buildFaqSchema');
    expect(routeSource).toContain('<SupportPageContent />');
    expect(routeSource).not.toContain('<MarketingHero');
    expect(routeSource).not.toContain('<SupportChannels');
    expect(routeSource).not.toContain('<FaqSection');
    expect(routeSource).not.toContain('<SupportCta');

    expect(storySource).toContain("title: 'Marketing/Routes/Support'");
    expect(storySource).toContain('component: SupportPageContent');
    expect(storySource).toContain("registryId: 'web-040-support'");
    expect(storySource).toContain("route: '/support'");
    expect(storySource).toContain(
      "source: 'apps/web/components/organisms/SupportPageContent.tsx'"
    );
    expect(SUPPORT_STORY_RECEIPT).toEqual({
      registryId: 'web-040-support',
      route: '/support',
      source: 'apps/web/components/organisms/SupportPageContent.tsx',
      sourceExport: 'SupportPageContent',
      storyExport: 'Web040Support',
      sourceSha: '00895196e53b823bb0311193b4af29f67b8849c1',
      proofScope: 'system-b-body-only',
      implementation: 'exact-production-body',
    });
    expect(storySource).toContain(
      "sourceSha: '00895196e53b823bb0311193b4af29f67b8849c1'"
    );
    expect(storySource).toContain("proofScope: 'system-b-body-only'");
    expect(storySource).toContain("sourceExport: 'SupportPageContent'");
    expect(storySource).toContain("storyExport: 'Web040Support'");
    expect(storySource).toContain('export const Web040Support');
    expect(storySource).toContain('story owns the shared body only');
  });

  it('binds the receipt to a full ancestral source with both exports', () => {
    expect(SUPPORT_STORY_RECEIPT.sourceSha).toMatch(/^[0-9a-f]{40}$/);
    expect(SUPPORT_STORY_RECEIPT.sourceExport).toBe('SupportPageContent');
    expect(SUPPORT_STORY_RECEIPT.storyExport).toBe('Web040Support');

    try {
      execFileSync('git', [
        'cat-file',
        '-e',
        `${SUPPORT_STORY_RECEIPT.sourceSha}^{commit}`,
      ]);
    } catch {
      expect(
        execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
          encoding: 'utf8',
        }).trim()
      ).toBe('true');
      return;
    }

    // Exit 0 and 1 are git's ancestry verdicts; any other exit is an execution
    // error, not a verdict — retry it. A shallow boundary severs ancestry for
    // an explicitly fetched commit, so a non-ancestor verdict in a shallow
    // checkout proves nothing (same contract as component-ship-gate's
    // storybook-story-quality-guard).
    let ancestorStatus: number | null = null;
    for (
      let attempt = 0;
      attempt < 3 && ancestorStatus !== 0 && ancestorStatus !== 1;
      attempt += 1
    ) {
      ancestorStatus = spawnSync('git', [
        'merge-base',
        '--is-ancestor',
        SUPPORT_STORY_RECEIPT.sourceSha,
        'HEAD',
      ]).status;
    }
    if (ancestorStatus !== 0) {
      expect(
        execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
          encoding: 'utf8',
        }).trim()
      ).toBe('true');
      return;
    }

    const sourceAtReceipt = execFileSync(
      'git',
      [
        'show',
        `${SUPPORT_STORY_RECEIPT.sourceSha}:${SUPPORT_STORY_RECEIPT.source}`,
      ],
      { encoding: 'utf8' }
    );
    const storyAtReceipt = execFileSync(
      'git',
      [
        'show',
        `${SUPPORT_STORY_RECEIPT.sourceSha}:apps/web/components/organisms/SupportPageContent.stories.tsx`,
      ],
      { encoding: 'utf8' }
    );
    expect(sourceAtReceipt).toContain(
      `export function ${SUPPORT_STORY_RECEIPT.sourceExport}`
    );
    expect(storyAtReceipt).toContain(
      `export const ${SUPPORT_STORY_RECEIPT.storyExport}`
    );
  });
});
