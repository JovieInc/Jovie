import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecentlyShippedSection } from './RecentlyShippedSection';

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
}));

vi.mock('@/lib/filesystem-paths', () => ({
  resolveMonorepoPath: vi.fn(() => '/repo/CHANGELOG.md'),
}));

const changelogFixture = `# Changelog

## [Unreleased]
- Not shown yet

## [2.3.0] - 2026-08-31
- Added launch notifications
- Improved profile routing
- Tightened design receipts
- Hidden overflow line
`;

describe('RecentlyShippedSection', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(changelogFixture);
  });

  it('renders bounded recent release cards from the changelog', () => {
    render(<RecentlyShippedSection />);

    expect(screen.getByText('Recently Shipped')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'We Ship Fast' })
    ).toHaveClass('line-clamp-2');
    expect(screen.getByText('Added launch notifications')).toBeInTheDocument();
    expect(screen.getByText('Tightened design receipts')).toBeInTheDocument();
    expect(screen.queryByText('Hidden overflow line')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /See all updates/i })
    ).toHaveAttribute('href', '/changelog');
  });
});
