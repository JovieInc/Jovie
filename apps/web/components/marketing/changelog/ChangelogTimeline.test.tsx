import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChangelogRelease } from '@/lib/changelog-parser';
import { ChangelogTimeline } from './ChangelogTimeline';

const RELEASES: readonly ChangelogRelease[] = [
  {
    version: '26.8.0',
    date: '2026-08-09',
    summary: 'A **deterministic release with `/pitch`** and `inline code`.',
    sections: {
      featured: [],
      added: ['**New workspace:** Review `release:status`.'],
      changed: ['One canonical navigation model.'],
      fixed: ['Stable compact layout.', 'Stable compact layout.'],
      removed: [
        'A duplicate route-local control.',
        '<img src=x onerror=alert(1)>',
      ],
    },
  },
];

describe('ChangelogTimeline', () => {
  it('renders the deterministic release state and every populated section', () => {
    const { container } = render(<ChangelogTimeline releases={RELEASES} />);

    expect(screen.getByText('v26.8.0')).toBeVisible();
    expect(screen.getByText('v26.8.0').closest('a')).toHaveAttribute(
      'href',
      '/changelog/26.8.0'
    );
    expect(container.querySelector('article')).toHaveAttribute('id', 'v26.8.0');
    expect(screen.getByText('Aug 9, 2026')).toBeVisible();
    expect(
      screen.getByText('deterministic release with', { exact: false })
    ).toBeVisible();
    expect(screen.getByText('/pitch', { selector: 'code' })).toBeVisible();
    expect(screen.getByText('/pitch').closest('strong')).toBeVisible();
    expect(screen.getByText('inline code', { selector: 'code' })).toBeVisible();
    expect(
      screen.getByText('New workspace:', { selector: 'strong' })
    ).toBeVisible();
    expect(
      screen.getByText('release:status', { selector: 'code' })
    ).toBeVisible();
    expect(screen.getByText('New')).toBeVisible();
    expect(screen.getByText('Improved')).toBeVisible();
    expect(screen.getByText('Fixed')).toBeVisible();
    expect(screen.getByText('Removed')).toBeVisible();
    expect(screen.getAllByText('Stable compact layout.')).toHaveLength(2);
    expect(container).not.toHaveTextContent('**');
    expect(container).not.toHaveTextContent('`');
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    expect(container.firstElementChild).toHaveAttribute(
      'data-reduced-motion',
      'static'
    );
    expect(screen.getByText('v26.8.0').closest('span')).toHaveClass(
      'motion-reduce:transition-none'
    );
  });

  it('renders the production empty state without release chrome', () => {
    render(<ChangelogTimeline releases={[]} />);

    expect(screen.getByText('No updates yet. Check back soon!')).toBeVisible();
    expect(screen.queryByText(/^v/)).not.toBeInTheDocument();
  });

  it('bounds the initial release list and progressively exposes every update', () => {
    const releases = Array.from({ length: 8 }, (_, index) => ({
      ...RELEASES[0],
      version: `26.8.${8 - index}`,
      date: `2026-08-${String(8 - index).padStart(2, '0')}`,
    }));
    const { container } = render(<ChangelogTimeline releases={releases} />);

    expect(container.querySelectorAll('article')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Show 5 More Updates' })
    ).toBeVisible();
    expect(screen.queryByText('v26.8.1')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Show 5 More Updates' })
    );
    expect(container.querySelectorAll('article')).toHaveLength(6);
    expect(
      screen.getByRole('button', { name: 'Show 2 More Updates' })
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Show 2 More Updates' })
    );
    expect(container.querySelectorAll('article')).toHaveLength(8);
    expect(screen.getByText('v26.8.1')).toBeVisible();
    expect(screen.getByText('Showing 8 of 8 updates')).toBeVisible();
    expect(screen.queryByRole('button', { name: /More Updates/ })).toBeNull();
  });
});

describe('web-026 changelog story provenance', () => {
  const STORY_PATH =
    'apps/web/components/marketing/changelog/ChangelogTimeline.stories.tsx';
  const SOURCE_PATH =
    'apps/web/components/marketing/changelog/ChangelogTimeline.tsx';

  it('declares a valid ancestral sourceSha containing the story and both exports', () => {
    const storySource = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/changelog/ChangelogTimeline.stories.tsx'
      ),
      'utf8'
    );
    expect(storySource).toContain("registryId: 'web-026-changelog'");
    expect(storySource).toContain("contractId: 'V1OpUm'");
    expect(storySource).toContain('export const Web026Changelog');

    const match = storySource.match(/sourceSha: '([0-9a-f]{40})'/);
    if (!match) {
      throw new Error(
        'ChangelogTimeline.stories.tsx must declare parameters.pen.sourceSha'
      );
    }
    const sourceSha = match[1];

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
      ['show', `${sourceSha}:${STORY_PATH}`],
      { encoding: 'utf8' }
    );
    const sourceAtReceipt = execFileSync(
      'git',
      ['show', `${sourceSha}:${SOURCE_PATH}`],
      { encoding: 'utf8' }
    );
    expect(storyAtReceipt).toContain('export const Web026Changelog');
    expect(sourceAtReceipt).toContain('export function ChangelogTimeline');
  });
});
