import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ActivityTableSkeleton,
  ActivityTableUnified,
} from './ActivityTableUnified';

describe('ActivityTableUnified', () => {
  it('uses the canonical table empty state when no activity exists', () => {
    render(<ActivityTableUnified items={[]} />);

    expect(screen.getByTestId('admin-activity-empty-state')).toHaveTextContent(
      'No Recent Activity'
    );
    expect(
      screen.getByText('Activity from the last 7 days will appear here.')
    ).toBeInTheDocument();
  });

  it('renders activity data with its operational status', () => {
    render(
      <ActivityTableUnified
        items={[
          {
            id: 'activity-1',
            user: '@operator',
            action: 'Approved a playlist',
            timestamp: '2 minutes ago',
            status: 'success',
          },
        ]}
      />
    );

    expect(screen.getByText('@operator')).toBeInTheDocument();
    expect(screen.getByText('Approved a playlist')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('keeps loading semantics on the canonical table skeleton', () => {
    const { container } = render(<ActivityTableSkeleton rows={3} />);

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getByText('Loading table data')).toBeInTheDocument();
    expect(
      container.querySelectorAll('tbody tr').length
    ).toBeGreaterThanOrEqual(3);
  });

  it('routes table API imports through the v9 compat adapter', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/features/admin/ActivityTableUnified.tsx'
      ),
      'utf8'
    );

    expect(source).toContain("'@/lib/tanstack-table'");
    expect(source).not.toContain("'@tanstack/react-table'");
    expect(source).toContain("rowMode='dense'");
  });

  it('scopes the noExplicitAny suppression to the TanStack column memo', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/features/admin/ActivityTableUnified.tsx'
      ),
      'utf8'
    );

    expect(source).toContain(
      '// biome-ignore lint/suspicious/noExplicitAny: TanStack Table requires any for mixed-value-type column arrays'
    );
    expect(source).not.toContain('biome-ignore-all');
    expect(source).not.toContain('biome-ignore-start');
  });

  it('makes the horizontally scrolling table region keyboard-accessible', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/features/admin/ActivityTableUnified.tsx'
      ),
      'utf8'
    );

    expect(source).toContain('function setTableKeyboardFocusable');
    expect(source).toContain('ref={setTableKeyboardFocusable}');
  });

  it('exposes a stable timestamp-cell testid for scoped queries', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/features/admin/ActivityTableUnified.tsx'
      ),
      'utf8'
    );

    expect(source).toContain("data-testid='admin-activity-timestamp'");
  });
});
