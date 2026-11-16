import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AdminActivityItem } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ActivityTableSkeleton,
  ActivityTableUnified,
} from './ActivityTableUnified';

const event = (
  id: string,
  status: AdminActivityItem['status'],
  action = 'Approved a generated playlist'
): AdminActivityItem => ({
  id,
  user: '@operator',
  action,
  timestamp: '2 minutes ago',
  status,
});

describe('ActivityTableUnified certificate', () => {
  it('keeps the empty table axe-clean', async () => {
    const { container } = render(<ActivityTableUnified items={[]} />);

    expect(
      screen.getByTestId('admin-activity-empty-state')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('labels each status and keeps the populated table axe-clean', async () => {
    const { container } = render(
      <ActivityTableUnified
        items={[
          event('a', 'success'),
          event('b', 'warning'),
          event('c', 'error'),
        ]}
      />
    );

    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Needs review')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the loading skeleton axe-clean and busy', async () => {
    const { container } = render(<ActivityTableSkeleton rows={3} />);

    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
    await expectNoA11yViolations(container);
  });

  it('keeps fifty long events axe-clean inside an RTL document', async () => {
    const long =
      'Re-ran enrichment, refreshed every streaming destination and re-pitched the release';
    const items = Array.from({ length: 50 }, (_, i) =>
      event(`e-${i}`, 'success', `${long} ${i + 1}`)
    );
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ActivityTableUnified items={items} />
      </div>
    );

    expect(screen.getByText(`${long} 50`)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
