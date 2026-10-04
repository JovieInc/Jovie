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
  it('documents only the verified CLI surface', () => {
    render(<CliLandingPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: CLI_HEADLINE })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Install' })
    ).toHaveClass('line-clamp-2');
    expect(
      screen.getByRole('heading', { level: 2, name: 'What You Can Do' })
    ).toHaveClass('line-clamp-2');
    expect(
      screen.getByRole('heading', { level: 2, name: 'CLI Reference' })
    ).toHaveClass('line-clamp-2');
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
    expect(pageText).toContain('No account');
    expect(pageText).toContain('No API key');
    expect(pageText).toContain('MCP server');
    expect(pageText).toContain('JSON output');
    expect(pageText).toContain('Give a creator a profile');
    expect(pageText).toContain('Plug Jovie into an agent');
    expect(pageText).toContain('Get a profile');
    expect(pageText).toContain('Give a profile to an agent');
    expect(pageText).toContain('Build against Jovie');
    expect(pageText).toContain('Give Jovie to an agent');

    for (const item of CLI_DOCUMENTED_COMMANDS) {
      expect(screen.getAllByText(item.command).length).toBeGreaterThan(0);
      expect(screen.getByText(item.request)).toBeVisible();
    }

    expect(
      CLI_DOCUMENTED_COMMANDS.find(item => item.command === 'jovie skill')
        ?.request
    ).toBe('Prints the Jovie SKILL.md for agents');

    expect(screen.queryByText(/login/i, { selector: 'h2' })).toBeNull();
    expect(screen.queryByText(/oauth/i, { selector: 'h2' })).toBeNull();
    expect(screen.queryByText('npm publish')).toBeNull();

    for (const item of CLI_FAQ_ITEMS) {
      expect(screen.getByText(item.question)).toBeVisible();
    }
  });

  it('docks the hero over its own abstract photo', () => {
    const { container } = render(<CliLandingPage />);
    const photo = container.querySelector('.marketing-hero-photo img');
    expect(photo?.getAttribute('src')).toContain('marketing-hero%2Fcli.webp');
    expect(photo).toHaveAttribute('alt', '');
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
    const read = (file: string) =>
      readFileSync(resolve(packageRoot, 'src', file), 'utf8');
    const cliSource = `${read('cli.ts')}\n${read('commands.ts')}`;
    const clientSource = read('client.ts');
    for (const item of CLI_DOCUMENTED_COMMANDS) {
      const words = item.command
        .replace(/^jovie /, '')
        .split(' ')
        .filter(word => !word.startsWith('<') && !word.startsWith('--'));
      expect(cliSource).toContain(
        words.length === 1
          ? `'${words[0]}'`
          : `path: [${words.map(word => `'${word}'`).join(', ')}]`
      );
      const route = item.request.match(/^(?:GET|POST) (\S+)/)?.[1];
      for (const part of route?.split(/\{\w+\}/) ?? []) {
        expect(clientSource).toContain(part);
      }
    }
    expect(cliSource).toContain('--base-url');
    expect(cliSource).toContain('--json');
    expect(cliSource).toContain('-h, --help');
    expect(cliSource).toContain('-v, --version');
    expect(cliSource).toContain('No login or API key');
    expect(isReservedUsername('cli')).toBe(true);
  });

  it('documents the published CLI Node engines range', () => {
    const packageJson = JSON.parse(
      readFileSync(
        resolve(process.cwd(), '../../packages/jovie-cli/package.json'),
        'utf8'
      )
    ) as { engines?: { node?: string } };
    const nodeFaq = CLI_FAQ_ITEMS.find(
      item => item.question === 'Which Node.js version does it need?'
    );

    expect(packageJson.engines?.node).toBe('>=24.21.0 <25');
    expect(nodeFaq?.answer).toContain('Node.js 24.21.0');
    expect(nodeFaq?.answer).toContain('below Node 25');
    expect(nodeFaq?.answer).toContain('published package engines field');
  });

  it('keeps every scrollable command block reachable by keyboard', () => {
    render(<CliLandingPage />);
    const blocks = document.querySelectorAll('article pre');
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const scroller = block.closest('section');
      expect(scroller).toHaveAttribute('tabindex', '0');
      expect(scroller?.getAttribute('aria-label')).toMatch(/ command$/);
      expect(scroller?.className).toContain('overflow-x-auto');
    }
  });
});
