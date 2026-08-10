import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SUPPORT_FAQ_ITEMS, SupportPageContent } from './SupportPageContent';
import { SUPPORT_STORY_RECEIPT } from './SupportPageContent.stories';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  page: vi.fn(),
}));

describe('SupportPageContent', () => {
  it('renders the exact shipped body in hero, channels, FAQ, CTA order', () => {
    const { container } = render(<SupportPageContent />);

    expect(
      screen.getByRole('heading', { level: 1, name: "We're Here To Help." })
    ).toBeVisible();
    const sectionHeadings = Array.from(container.querySelectorAll('section'))
      .map(section => section.querySelector('h1, h2')?.textContent?.trim())
      .filter((heading): heading is string => heading !== undefined);

    expect(sectionHeadings).toEqual([
      "We're Here To Help.",
      'How Can We Help?',
      'Frequently Asked Questions',
      'Still Need Help?',
    ]);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getAllByTestId('support-cta')).toHaveLength(1);
    for (const action of screen.getAllByRole('link').filter(link =>
      /^(Visit|Send email)$/.test(link.textContent?.trim() ?? '')
    )) {
      expect(action).toHaveClass('before:h-11', 'before:min-w-11');
    }
    expect(
      screen.getByRole('link', { name: /send email to support team/i })
    ).toHaveAttribute('href', 'mailto:support@jov.ie');
  });

  it('keeps the four production FAQ items and copy deterministic', () => {
    expect(SUPPORT_FAQ_ITEMS).toEqual([
      {
        question: 'How do I get started with Jovie?',
        answer:
          'Create an account, pick your handle, connect Spotify or Apple Music, and set up your profile. Full walkthrough at https://docs.jov.ie/getting-started.',
      },
      {
        question: 'How do smart links work?',
        answer:
          'When you add a release, Jovie generates a smart link that detects each fan\u2019s preferred streaming platform and routes them there automatically.',
      },
      {
        question: 'How do I upgrade my plan?',
        answer:
          'Head to Settings \u2192 Billing to view available plans and manage your subscription.',
      },
      {
        question: 'How do I contact support?',
        answer:
          'Email support@jov.ie \u2014 we typically respond within one business day.',
      },
    ]);

    render(<SupportPageContent />);
    for (const { question } of SUPPORT_FAQ_ITEMS) {
      expect(screen.getByRole('button', { name: question })).toBeVisible();
    }
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
    expect(routeSource).toContain('buildFaqSchema([...SUPPORT_FAQ_ITEMS])');
    expect(routeSource).toContain('buildBreadcrumbSchema');
    expect(routeSource.match(/type='application\/ld\+json'/g)).toHaveLength(2);
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
      sourceSha: '70cb3b51b852a25213911ffe78cc81c35a73f788',
      proofScope: 'system-b-body-only',
      implementation: 'exact-production-body',
    });
    expect(storySource).toContain(
      "sourceSha: '70cb3b51b852a25213911ffe78cc81c35a73f788'"
    );
    expect(storySource).toContain("proofScope: 'system-b-body-only'");
    expect(storySource).toContain("sourceExport: 'SupportPageContent'");
    expect(storySource).toContain("storyExport: 'Web040Support'");
    expect(storySource).toContain('export const Web040Support');
    expect(storySource).toContain(
      'story owns the shared body only'
    );
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

    expect(() =>
      execFileSync('git', [
        'merge-base',
        '--is-ancestor',
        SUPPORT_STORY_RECEIPT.sourceSha,
        'HEAD',
      ])
    ).not.toThrow();

    const sourceAtReceipt = execFileSync(
      'git',
      ['show', `${SUPPORT_STORY_RECEIPT.sourceSha}:${SUPPORT_STORY_RECEIPT.source}`],
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
