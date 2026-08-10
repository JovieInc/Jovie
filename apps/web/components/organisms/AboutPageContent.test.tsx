import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ABOUT_FAQ_ITEMS, AboutPageContent } from './AboutPageContent';
import { ABOUT_STORY_RECEIPT } from './AboutPageContent.stories';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  page: vi.fn(),
}));

describe('AboutPageContent', () => {
  it('renders the exact shipped body in hero, story, features, FAQ order', () => {
    const { container } = render(<AboutPageContent />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Release More Music. Do Less Release Work.',
      })
    ).toBeVisible();
    const sectionHeadings = Array.from(container.querySelectorAll('section'))
      .map(section => section.querySelector('h2')?.textContent?.trim())
      .filter((heading): heading is string => heading !== undefined);

    expect(sectionHeadings).toEqual([
      'Why Jovie Exists',
      'What Jovie Does',
      'Frequently Asked Questions',
    ]);
    expect(screen.getByText('— Tim White, Founder')).toBeVisible();
    for (const feature of [
      'Smart Links',
      'Artist Profiles',
      'Audience Intelligence',
      'Release Automation',
      'AI Tools',
      'Tipping & Payments',
    ]) {
      expect(
        screen.getByRole('heading', { level: 3, name: feature })
      ).toBeVisible();
    }
  });

  it('keeps the six production FAQ items and copy deterministic', () => {
    expect(ABOUT_FAQ_ITEMS).toEqual([
      {
        question: 'What is Jovie?',
        answer:
          'Jovie is a release platform for independent musicians. It combines smart links, artist profiles, audience intelligence, release automation, and AI tools to help artists release more music with less work. Jovie is available at jov.ie.',
      },
      {
        question: 'Is Jovie related to Jovie childcare or babysitting?',
        answer:
          'No. Jovie the music platform (jov.ie) and Jovie the childcare franchise (jovie.com) are completely separate, unrelated companies in different industries. Jovie the music platform is operated by Jovie Technology Inc. The childcare franchise is operated by Bright Horizons Family Solutions.',
      },
      {
        question: 'Who founded Jovie?',
        answer:
          'Jovie was founded by Tim White, a music marketing veteran with 15+ years of experience working with labels like Armada Music and Universal Music, and running digital campaigns for artists like Tory Lanez and Megan Thee Stallion, and brands like Google and the NFL.',
      },
      {
        question: 'What does Jovie do?',
        answer:
          'Jovie gives independent musicians smart links that route fans to the right streaming platform, professional artist profiles, audience intelligence and fan CRM, automatic release notifications, and AI tools that know your actual career data — stream counts, tour dates, collaborations, and more.',
      },
      {
        question: 'Is Jovie free?',
        answer:
          'Yes, Jovie offers a free tier that lets you create a profile, add releases, and start collecting fans. Paid plans unlock advanced analytics, release notifications, contact export, and more.',
      },
      {
        question: 'How is Jovie different from Linktree?',
        answer:
          'Linktree is a general-purpose link-in-bio tool. Jovie is built specifically for musicians — it automatically generates smart links for music releases, routes fans to the right streaming platform, collects and manages fan contacts, sends automatic notifications when you drop new music, and includes AI tools that understand your career. Jovie optimizes for fan conversion, not just link display.',
      },
    ]);

    render(<AboutPageContent />);
    for (const { question } of ABOUT_FAQ_ITEMS) {
      expect(screen.getByRole('button', { name: question })).toBeVisible();
    }
  });

  it('keeps metadata and schema ownership in the route and binds the exact story', () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), 'app/(marketing)/about/page.tsx'),
      'utf8'
    );
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/AboutPageContent.stories.tsx'
      ),
      'utf8'
    );

    expect(routeSource).toContain('export const metadata: Metadata');
    expect(routeSource).toContain('export const revalidate = false');
    expect(routeSource).toContain('buildFaqSchema([...ABOUT_FAQ_ITEMS])');
    expect(routeSource).toContain('buildOrganizationSchema');
    expect(routeSource).toContain('buildBreadcrumbSchema');
    expect(routeSource.match(/type='application\/ld\+json'/g)).toHaveLength(3);
    expect(routeSource).toContain('<AboutPageContent />');
    expect(routeSource).not.toContain('<MarketingHero');
    expect(routeSource).not.toContain('<MarketingContainer');
    expect(routeSource).not.toContain('<FaqSection');

    expect(storySource).toContain("title: 'Marketing/Routes/About'");
    expect(storySource).toContain('component: AboutPageContent');
    expect(storySource).toContain("registryId: 'web-016-about'");
    expect(storySource).toContain("route: '/about'");
    expect(storySource).toContain(
      "source: 'apps/web/components/organisms/AboutPageContent.tsx'"
    );
    expect(ABOUT_STORY_RECEIPT).toEqual({
      registryId: 'web-016-about',
      route: '/about',
      source: 'apps/web/components/organisms/AboutPageContent.tsx',
      sourceExport: 'AboutPageContent',
      storyExport: 'Web016About',
      sourceSha: 'c767a55d279c69fbddb32324f78faced8938884c',
      proofScope: 'system-b-body-only',
      implementation: 'exact-production-body',
    });
    expect(storySource).toContain(
      "sourceSha: 'c767a55d279c69fbddb32324f78faced8938884c'"
    );
    expect(storySource).toContain("proofScope: 'system-b-body-only'");
    expect(storySource).toContain("sourceExport: 'AboutPageContent'");
    expect(storySource).toContain("storyExport: 'Web016About'");
    expect(storySource).toContain('export const Web016About');
    expect(storySource.match(/export const Web\w+/g)).toHaveLength(1);
    expect(storySource).toContain('story owns the shared body only');
  });

  it('binds the receipt to the audited source SHA with unchanged body copy', () => {
    expect(ABOUT_STORY_RECEIPT.sourceSha).toMatch(/^[0-9a-f]{40}$/);
    expect(ABOUT_STORY_RECEIPT.sourceExport).toBe('AboutPageContent');
    expect(ABOUT_STORY_RECEIPT.storyExport).toBe('Web016About');

    let routeAtReceipt: string;
    try {
      routeAtReceipt = execFileSync(
        'git',
        [
          'show',
          `${ABOUT_STORY_RECEIPT.sourceSha}:apps/web/app/(marketing)/about/page.tsx`,
        ],
        { encoding: 'utf8' }
      );
    } catch {
      // The audit SHA is only guaranteed to exist in full-history checkouts;
      // shallow CI checkouts skip the ancestry proof.
      expect(
        execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
          encoding: 'utf8',
        }).trim()
      ).toBe('true');
      return;
    }

    // The extracted body must be byte-identical copy from the audited route:
    // hero, both prose sections, and every FAQ question/answer appear verbatim.
    expect(routeAtReceipt).toContain(
      'Release More Music. Do Less Release Work.'
    );
    expect(routeAtReceipt).toContain('Why Jovie Exists');
    expect(routeAtReceipt).toContain('What Jovie Does');
    for (const { question, answer } of ABOUT_FAQ_ITEMS) {
      expect(routeAtReceipt).toContain(question);
      expect(routeAtReceipt).toContain(answer);
    }
  });
});
