import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NotFoundPageContent } from '@/components/site/NotFoundPageContent';
import { APP_ROUTES } from '@/constants/routes';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const componentPath = join(appRoot, 'components/site/NotFoundPageContent.tsx');
const rootRoutePath = join(appRoot, 'app/not-found.tsx');
const marketingLayoutPath = join(appRoot, 'app/(marketing)/layout.tsx');
const marketingRoutePath = join(appRoot, 'app/(marketing)/not-found.tsx');

const hashMark = String.fromCharCode(35);
const hardcodedHashColorPattern = new RegExp(`${hashMark}[\\da-fA-F]{3,8}\\b`);
const rawVisualUtilityPattern =
  /\b(?:bg|border|text|ring|shadow|outline|rounded|h|w|max-w|min-h|min-w|tracking|leading|px|py|pt|pb)-\[/;

describe('NotFoundPageContent', () => {
  it('renders profile miss copy with both CTAs', () => {
    render(<NotFoundPageContent variant='profile-miss' surface='profile' />);

    expect(
      screen.getByRole('heading', { name: 'Profile not found' })
    ).toBeInTheDocument();
    expect(screen.getByText("This profile doesn't exist.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute(
      'href',
      APP_ROUTES.HOME
    );
    expect(
      screen.getByRole('link', { name: 'Search artists' })
    ).toHaveAttribute('href', APP_ROUTES.ARTIST_PROFILES);
  });

  it('renders generic copy with both CTAs', () => {
    render(<NotFoundPageContent variant='generic' surface='root' />);

    expect(
      screen.getByRole('heading', { name: "We can't find that page." })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The link may be broken or the page may have been removed.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Search artists' })
    ).toBeInTheDocument();
  });

  it('does not render numeric link IDs or debug dumps', () => {
    const { container } = render(
      <NotFoundPageContent variant='profile-miss' surface='profile' />
    );

    expect(container.textContent).not.toMatch(/\b\d{6,}\b/);
  });

  it('keeps shared not-found CTA primitives free of route-local token drift', async () => {
    const source = await readFile(componentPath, 'utf8');

    expect(source).not.toMatch(hardcodedHashColorPattern);
    expect(source).not.toMatch(rawVisualUtilityPattern);
    expect(source).toContain('`${prefix}-actions`');
    expect(source).toContain('`${prefix}-action-secondary`');
    expect(source).not.toContain('style={{');
  });

  it('keeps generic root and marketing 404s on the same public recovery system', async () => {
    const [rootRoute, marketingLayout, marketingRoute] = await Promise.all([
      readFile(rootRoutePath, 'utf8'),
      readFile(marketingLayoutPath, 'utf8'),
      readFile(marketingRoutePath, 'utf8'),
    ]);

    for (const route of [rootRoute, marketingRoute]) {
      expect(route).toContain(
        "<NotFoundPageContent variant='generic' surface='root' />"
      );
      expect(route).toContain('system-b-root-not-found-content');
      expect(route).not.toContain("from 'next/link'");
    }

    expect(rootRoute).toContain('<PublicPageShell');
    expect(rootRoute).not.toContain('<MarketingHeader');
    expect(rootRoute).not.toContain('<MarketingFooter');
    expect(marketingLayout).toContain('<PublicPageShell');
  });
});
