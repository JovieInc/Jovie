import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CLI_DOCUMENTED_COMMANDS,
  CLI_FAQ_ITEMS,
  CLI_HEADLINE,
  CLI_PRIMARY_CTA_LABEL,
  CLI_SUBTITLE,
  CliLandingPage,
} from '@/components/marketing/CliLandingPage';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing';
import { isReservedUsername } from '@/lib/validation/username-core';
import { VISUAL_QA_VIEWPORTS } from '@/lib/visual-qa/viewports';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  page: vi.fn(),
}));

function readWebSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('CLI landing page', () => {
  it('documents only verified CLI commands and the unpublished install path', () => {
    render(<CliLandingPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: CLI_HEADLINE })
    ).toBeVisible();
    expect(screen.getByText(CLI_SUBTITLE)).toBeVisible();
    expect(screen.getByTestId('cli-hero-install')).toHaveAttribute(
      'href',
      '#install'
    );
    expect(screen.getByTestId('cli-hero-install')).toHaveTextContent(
      CLI_PRIMARY_CTA_LABEL
    );

    const pageText = document.body.textContent ?? '';
    expect(pageText).toContain('npm install --global @jovie/cli');
    expect(pageText).toContain('jovie --help');
    expect(pageText).toContain('jovie --version');
    expect(pageText).toContain('After a versioned release is published to npm');

    for (const item of CLI_DOCUMENTED_COMMANDS) {
      expect(screen.getByText(item.command)).toBeVisible();
      expect(screen.getByText(item.request)).toBeVisible();
    }

    expect(screen.queryByText(/login/i, { selector: 'h2' })).toBeNull();
    expect(screen.queryByText(/oauth/i, { selector: 'h2' })).toBeNull();
    expect(screen.queryByText('npm publish')).toBeNull();

    for (const item of CLI_FAQ_ITEMS) {
      expect(screen.getByText(item.question)).toBeVisible();
    }
  });

  it('composes shared hero, prose, FAQ, and footer CTA primitives', () => {
    const source = readWebSource('components/marketing/CliLandingPage.tsx');
    const route = readWebSource('app/(marketing)/cli/page.tsx');

    expect(source).toContain('MarketingHero');
    expect(source).toContain("align='center'");
    expect(source).toContain('logos={false}');
    expect(source).toContain("width='prose'");
    expect(source).toContain('FaqSection');
    expect(source).toContain('MarketingFooterCta');
    expect(source).not.toMatch(/\.css['"]/);
    expect(route).toContain('export const revalidate = false');
    expect(route).toContain('CliLandingPage');
    expect(route).toContain('buildFaqSchema');
  });

  it('reserves geometry and clips overflow instead of shifting layout', () => {
    const source = readWebSource('components/marketing/CliLandingPage.tsx');
    const layout = readWebSource('app/(marketing)/layout.tsx');

    expect(source).toContain('overflow-x-auto');
    expect(source).not.toMatch(/\bhidden=\{/);
    expect(source).not.toMatch(/\bisLoading\b/);
    expect(layout).toContain('overflow-x-clip');
  });

  it('binds typed active variants for the seo recipe', () => {
    const entry = MARKETING_ROUTE_MANIFEST.find(item => item.url === '/cli');
    expect(entry).toMatchObject({
      glob: '(marketing)/cli/page.tsx',
      recipeId: 'seo',
      healthCheck: { path: '/cli', expected: 'page' },
    });
    expect(
      entry?.renderedSections.map(section =>
        section.kind === 'approved-section'
          ? `${section.sectionId}${section.variantId ? `/${section.variantId}` : ''}`
          : section.proposalId
      )
    ).toEqual([
      'hero/centered-none',
      'content-prose',
      'faq/structured-data-list',
      'cta/final-single-claim',
    ]);
  });

  it('keeps desktop and mobile review viewports at the canonical sizes', () => {
    expect(VISUAL_QA_VIEWPORTS.desktop).toEqual({ width: 1440, height: 900 });
    expect(VISUAL_QA_VIEWPORTS.mobile).toEqual({ width: 390, height: 844 });
  });

  it('stays inside the verified CLI command surface', () => {
    const packageRoot = resolve(process.cwd(), '../../packages/jovie-cli');
    const cliSource = readFileSync(resolve(packageRoot, 'src/cli.ts'), 'utf8');
    const clientSource = readFileSync(
      resolve(packageRoot, 'src/client.ts'),
      'utf8'
    );
    const documented = `${cliSource}\n${clientSource}`;
    for (const item of CLI_DOCUMENTED_COMMANDS) {
      expect(cliSource).toContain(item.command.replace(/^jovie /, ''));
      expect(documented).toContain(item.request.replace(/^GET /, ''));
    }
    expect(cliSource).toContain('--base-url');
    expect(cliSource).toContain('--json');
    expect(cliSource).toContain('-h, --help');
    expect(cliSource).toContain('-v, --version');
    expect(cliSource).toContain('No login, API key');
    expect(isReservedUsername('cli')).toBe(true);
  });
});
