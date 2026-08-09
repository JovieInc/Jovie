import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RootNotFound from '@/app/not-found';

describe('web-187 investor memo missing-state source contract', () => {
  it('renders the exact root not-found body', () => {
    render(<RootNotFound />);

    expect(screen.getByTestId('not-found')).toBeVisible();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: "We can't find that page.",
      })
    ).toBeVisible();
    expect(
      screen.getByText(
        'The link may be broken or the page may have been removed.'
      )
    ).toBeVisible();
  });

  it('keeps access, manifest, markdown, and memo content server-owned', () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), 'app/investor-portal/[slug]/page.tsx'),
      'utf8'
    );
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/InvestorMemoMissingState.stories.tsx'
      ),
      'utf8'
    );

    expect(routeSource).toContain('async function requireInvestorAccess()');
    expect(routeSource).toContain("cookieStore.get('__investor_token')");
    expect(routeSource).toContain('if (!token)');
    expect(routeSource).toContain('if (!page)');
    expect(routeSource.match(/notFound\(\)/g)).toHaveLength(2);
    expect(routeSource).toContain(
      'getMarkdownDocument(`investors/${page.file}`)'
    );
    expect(routeSource).toContain('<MemoContent');

    expect(storySource).toContain("import RootNotFound from '@/app/not-found'");
    expect(storySource).toContain(
      "registryId: 'web-187-investor-portal--[slug]'"
    );
    expect(storySource).toContain("fixtureState: 'missing-access-or-memo'");
    expect(storySource).toContain("proofTier: 'source-backed-missing-state'");
    expect(storySource).not.toContain('MemoContent');
    expect(storySource).not.toContain('investors/');
    expect(storySource).not.toContain('__investor_token');
  });
});
