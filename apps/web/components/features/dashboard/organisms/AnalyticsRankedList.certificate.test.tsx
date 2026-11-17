import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Globe, MapPin } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AnalyticsRankedList } from './AnalyticsRankedList';

describe('AnalyticsRankedList certificate', () => {
  it('keeps the loading skeleton axe-clean', async () => {
    const { container } = render(
      <AnalyticsRankedList
        icon={Globe}
        loading
        emptyMessage='No source data yet'
        items={[]}
      />
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    await expectNoA11yViolations(container);
  });

  it('keeps the plain empty message axe-clean', async () => {
    const { container } = render(
      <AnalyticsRankedList
        icon={Globe}
        loading={false}
        emptyMessage='No source data yet'
        items={[]}
      />
    );

    expect(screen.getByText('No source data yet')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('runs the designed empty state action', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <AnalyticsRankedList
        icon={MapPin}
        loading={false}
        emptyMessage='No City Data Yet'
        items={[]}
        emptyState={{
          description: 'Cities appear as visitors open your profile.',
          action: { label: 'View Countries', onClick },
        }}
      />
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'View Countries' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ranks a partial list and keeps undecodable labels as written', async () => {
    const { container } = render(
      <AnalyticsRankedList
        icon={MapPin}
        loading={false}
        emptyMessage='No city data yet'
        items={[
          { key: 'la', label: 'Los Angeles', value: '412' },
          { key: 'bad', label: '100%', value: '3' },
        ]}
      />
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('1Los Angeles412');
    expect(rows[1]).toHaveTextContent('2100%3');
    await expectNoA11yViolations(container);
  });

  it('keeps long labels and right-to-left rows accessible', async () => {
    const long =
      'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy?si=release-day-campaign';
    const { container } = render(
      <div dir='rtl'>
        <AnalyticsRankedList
          icon={MapPin}
          loading={false}
          emptyMessage='No city data yet'
          items={[
            { key: 'a', label: long, value: '1,284,903' },
            { key: 'cai', label: 'القاهرة', value: '412' },
          ]}
        />
      </div>
    );

    expect(screen.getByText(long)).toHaveClass('truncate');
    expect(screen.getByText('القاهرة')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
