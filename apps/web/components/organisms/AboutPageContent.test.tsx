import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ABOUT_COPY, ABOUT_DEFINITION } from '@/data/aboutCopy';
import { ABOUT_FAQ_ITEMS, AboutPageContent } from './AboutPageContent';
import { ABOUT_STORY_RECEIPT } from './AboutPageContent.stories';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  page: vi.fn(),
}));

describe('AboutPageContent', () => {
  it('opens with one plain H1 and defines Jovie in one sentence', () => {
    render(<AboutPageContent />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: ABOUT_COPY.headline })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'What Jovie is' })
    ).toBeVisible();
    expect(screen.getByText(ABOUT_DEFINITION)).toBeVisible();
  });

  it('closes with one quiet claim link instead of a request-access band', () => {
    render(<AboutPageContent />);
    expect(screen.queryByText(/request access/i)).toBeNull();
    const closing = screen.getByTestId('marketing-section-cta');
    expect(closing.querySelectorAll('a')).toHaveLength(1);
    expect(
      screen.getByRole('link', { name: 'Claim your profile' })
    ).toBeVisible();
  });

  it('renders what, why, who, contact, then questions, in that order', () => {
    const { container } = render(<AboutPageContent />);
    const headings = Array.from(container.querySelectorAll('h2')).map(h =>
      h.textContent?.trim()
    );
    expect(headings.slice(0, 6)).toEqual([
      'What Jovie is',
      'Why it exists',
      'Who makes it',
      'Contact',
      'Related',
      'Questions',
    ]);
    expect(screen.getByTestId('marketing-section-hero')).toHaveAttribute(
      'data-marketing-variant',
      'left-none'
    );
    expect(screen.getByTestId('marketing-section-faq')).toBeVisible();
    expect(screen.queryByTestId('about-page-refresh')).toBeNull();
  });

  it('names the founder and operator without a biography', () => {
    render(<AboutPageContent />);
    expect(
      screen.getByText(/Founded by Tim White\. Jovie is operated by/)
    ).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('link', { name: /Tim White/ })).toBeNull();
  });

  it('links the support email and support page', () => {
    render(<AboutPageContent />);
    expect(
      screen.getByRole('link', { name: ABOUT_COPY.contact.email })
    ).toHaveAttribute('href', `mailto:${ABOUT_COPY.contact.email}`);
    expect(
      screen.getByRole('link', { name: ABOUT_COPY.contact.supportLabel })
    ).toHaveAttribute('href', '/support');
  });

  it('links three to five related pages from the body for the GEO sibling-link check', () => {
    render(<AboutPageContent />);
    const hrefs = ABOUT_COPY.related.links.map(link => link.href);
    expect(hrefs).toEqual(['/product', '/pricing', '/changelog']);
    for (const link of ABOUT_COPY.related.links) {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        link.href
      );
    }
    expect(hrefs.length + 1).toBeGreaterThanOrEqual(3);
    expect(hrefs.length + 1).toBeLessThanOrEqual(5);
  });

  it('shows every question and answer as visible text for answer engines', () => {
    render(<AboutPageContent />);
    expect(ABOUT_FAQ_ITEMS.map(item => item.question)).toEqual([
      'What is Jovie?',
      'Who founded Jovie?',
      'Where is Jovie based?',
      'How do I contact Jovie?',
      'Is Jovie free?',
      'Is Jovie related to Jovie childcare?',
    ]);
    for (const { question, answer } of ABOUT_FAQ_ITEMS) {
      expect(screen.getByText(question)).toBeVisible();
      expect(screen.getByText(answer)).toBeVisible();
    }
  });

  it('carries no founder biography, resume claims, or segment language', () => {
    const strings: string[] = [];
    JSON.stringify([ABOUT_COPY, ABOUT_FAQ_ITEMS], (_key, value) => {
      if (typeof value === 'string') strings.push(value);
      return value;
    });
    const copy = strings.join('\n');
    expect(copy).not.toMatch(
      /Armada|Clio|Hulu|NFL|NBA|Google|Netflix|Lauryn|Cosmic Gate|500|15\+|years/i
    );
    expect(copy).not.toMatch(/music|artist|musician|\bfans?\b|producer|label/i);
    expect(copy).not.toMatch(/[–—]/);
    expect(copy).not.toMatch(/#1|number one|guaranteed|best in/i);
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
    expect(routeSource.match(/type='application\/ld\+json'/g)).toHaveLength(5);
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
      sourceAuditBaseSha: 'c767a55d279c69fbddb32324f78faced8938884c',
      containingMergeSha: '00895196e53b823bb0311193b4af29f67b8849c1',
      proofScope: 'system-b-body-only',
      implementation: 'exact-production-body',
    });
    expect(storySource).toContain(
      "sourceAuditBaseSha: 'c767a55d279c69fbddb32324f78faced8938884c'"
    );
    expect(storySource).toContain(
      "containingMergeSha: '00895196e53b823bb0311193b4af29f67b8849c1'"
    );
    expect(storySource).toContain("proofScope: 'system-b-body-only'");
    expect(storySource).toContain("sourceExport: 'AboutPageContent'");
    expect(storySource).toContain("storyExport: 'Web016About'");
    expect(storySource).toContain('export const Web016About');
    expect(storySource.match(/export const Web\w+/g)).toHaveLength(1);
    expect(storySource).toContain('story owns the shared body only');
  });

  it('binds the receipt to a containing merge with both named exports', () => {
    expect(ABOUT_STORY_RECEIPT.containingMergeSha).toMatch(/^[0-9a-f]{40}$/);
    expect(ABOUT_STORY_RECEIPT.sourceExport).toBe('AboutPageContent');
    expect(ABOUT_STORY_RECEIPT.storyExport).toBe('Web016About');

    try {
      execFileSync('git', [
        'cat-file',
        '-e',
        `${ABOUT_STORY_RECEIPT.containingMergeSha}^{commit}`,
      ]);
    } catch {
      // The containing merge is only guaranteed to exist in full-history checkouts;
      // shallow CI checkouts skip the ancestry proof.
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
        ABOUT_STORY_RECEIPT.containingMergeSha,
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
        `${ABOUT_STORY_RECEIPT.containingMergeSha}:${ABOUT_STORY_RECEIPT.source}`,
      ],
      { encoding: 'utf8' }
    );
    const storyAtReceipt = execFileSync(
      'git',
      [
        'show',
        `${ABOUT_STORY_RECEIPT.containingMergeSha}:apps/web/components/organisms/AboutPageContent.stories.tsx`,
      ],
      { encoding: 'utf8' }
    );
    expect(sourceAtReceipt).toContain(
      `export function ${ABOUT_STORY_RECEIPT.sourceExport}`
    );
    expect(storyAtReceipt).toContain(
      `export const ${ABOUT_STORY_RECEIPT.storyExport}`
    );
  });

  it('preserves the audit-base route copy provenance', () => {
    expect(ABOUT_STORY_RECEIPT.sourceAuditBaseSha).toMatch(/^[0-9a-f]{40}$/);

    let routeAtReceipt: string;
    try {
      routeAtReceipt = execFileSync(
        'git',
        [
          'show',
          `${ABOUT_STORY_RECEIPT.sourceAuditBaseSha}:apps/web/app/(marketing)/about/page.tsx`,
        ],
        { encoding: 'utf8' }
      );
    } catch {
      // The audit SHA is only guaranteed to exist in full-history checkouts;
      // shallow CI checkouts skip the old-route copy proof.
      expect(
        execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
          encoding: 'utf8',
        }).trim()
      ).toBe('true');
      return;
    }

    // Historical audit SHA keeps the pre-JOV-6261 artist-only company copy.
    // Current production copy is asserted separately against ABOUT_FAQ_ITEMS.
    expect(routeAtReceipt).toContain(
      'Release More Music. Do Less Release Work.'
    );
    expect(routeAtReceipt).toContain('Why Jovie Exists');
    expect(routeAtReceipt).toContain('What Jovie Does');
    expect(routeAtReceipt).toContain('What is Jovie?');
    expect(routeAtReceipt).toContain(
      'Jovie is a release platform for independent musicians.'
    );
  });
});
