import { render, screen } from '@testing-library/react';
import { Music } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ContentMetricRow } from './ContentMetricRow';

describe('ContentMetricRow', () => {
  it('pairs a truncating label with its value and icon', async () => {
    const { container } = render(
      <ContentMetricRow
        icon={Music}
        iconClassName='text-accent'
        label='Saves'
        value='3,204'
        valueClassName='text-success'
      />
    );

    expect(screen.getByText('Saves')).toHaveClass('truncate');
    expect(screen.getByText('3,204')).toHaveClass(
      'tabular-nums',
      'text-success'
    );
    expect(container.querySelector('svg')).toHaveClass('text-accent');
    await expectNoA11yViolations(container);
  });

  it('shows an empty zero value and a partial row without an icon', async () => {
    const { container } = render(
      <div>
        <ContentMetricRow label='Saves' value={0} />
        <ContentMetricRow label='Playlist adds' value='412' />
      </div>
    );

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('412')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps a long label and an Arabic row axe-clean', async () => {
    const longLabel =
      'Saves from every playlist, profile and release page this month';
    const { container } = render(
      <div className='w-72'>
        <ContentMetricRow label={longLabel} value='3,204' />
        <div dir='rtl' lang='ar'>
          <ContentMetricRow icon={Music} label='الحفظ' value='3,204' />
        </div>
      </div>
    );

    expect(screen.getByText(longLabel)).toHaveClass('truncate');
    expect(screen.getByText('الحفظ')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
