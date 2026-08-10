import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getComparison } from '@/content/comparisons';
import { ComparisonPageContent } from './ComparisonPageContent';

const data = getComparison('linktree');

if (!data) {
  throw new Error('Missing canonical linktree comparison fixture');
}

describe('ComparisonPageContent', () => {
  it('renders the complete checked-in comparison body', () => {
    render(<ComparisonPageContent data={data} />);

    expect(
      screen.getByRole('heading', { level: 1, name: data.heroHeadline })
    ).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(
      data.features.length + 1
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'The Bottom Line' })
    ).toBeInTheDocument();
    expect(screen.getByText(data.bottomLine)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Try Jovie Free' })
    ).toHaveAttribute('href', '/signup');
    expect(screen.getAllByRole('button')).toHaveLength(data.faq.length);
  });

  it('is shared by the route and deterministic Storybook fixture', () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), 'app/(marketing)/compare/[slug]/page.tsx'),
      'utf8'
    );
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/ComparisonPageContent.stories.tsx'
      ),
      'utf8'
    );

    expect(routeSource).toContain('<ComparisonPageContent data={data} />');
    expect(routeSource).toContain('buildFaqSchema(data.faq)');
    expect(routeSource).toContain('buildBreadcrumbSchema');
    expect(routeSource).not.toContain('Feature Comparison');
    expect(storySource).toContain("getComparison('linktree')");
    expect(storySource).toContain('component: ComparisonPageContent');
    expect(storySource).toContain("registryId: 'web-027-compare--[slug]'");
  });

  it('records true provenance for the web-027 story sourceSha', () => {
    const storyPath =
      'apps/web/components/organisms/ComparisonPageContent.stories.tsx';
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/organisms/ComparisonPageContent.stories.tsx'
      ),
      'utf8'
    );

    const match = storySource.match(/sourceSha: '([0-9a-f]{40})'/);
    expect(match).not.toBeNull();
    const sourceSha = match?.[1] as string;
    expect(sourceSha).toBe('da7ea056fe9df567fff098cdeb13e9b3785f707e');

    try {
      execFileSync('git', ['cat-file', '-e', `${sourceSha}^{commit}`]);
    } catch {
      expect(
        execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
          encoding: 'utf8',
        }).trim()
      ).toBe('true');
      return;
    }

    expect(() =>
      execFileSync('git', ['merge-base', '--is-ancestor', sourceSha, 'HEAD'])
    ).not.toThrow();

    const storyAtReceipt = execFileSync(
      'git',
      ['show', `${sourceSha}:${storyPath}`],
      { encoding: 'utf8' }
    );
    expect(storyAtReceipt).toContain('export const Web027CompareLinktree');
    expect(storyAtReceipt).toContain("registryId: 'web-027-compare--[slug]'");
  });
});
