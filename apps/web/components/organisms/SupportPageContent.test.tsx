import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SUPPORT_FAQ_ITEMS, SupportPageContent } from './SupportPageContent';

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
    expect(storySource).toContain(
      "sourceSha: '61690d2a4af920183f4a85366799ff0bafe4540b'"
    );
    expect(storySource).toContain('export const Web040Support');
    expect(storySource).toContain(
      'Section taxonomy and manifest evidence remain owner-stacked'
    );
  });
});
