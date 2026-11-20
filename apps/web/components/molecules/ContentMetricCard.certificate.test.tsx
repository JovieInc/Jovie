import { render, screen } from '@testing-library/react';
import { AlertTriangle, Eye } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ContentMetricCard } from './ContentMetricCard';

describe('ContentMetricCard certificate', () => {
  it('renders the default card with its header slot and subtitle', async () => {
    const { container } = render(
      <ContentMetricCard
        as='section'
        aria-label='Total streams'
        icon={Eye}
        label='Total streams'
        value='128.4k'
        subtitle='Last 28 days'
        headerRight={<span>Live</span>}
      />
    );

    const card = screen.getByRole('region', { name: 'Total streams' });
    expect(card).toHaveTextContent('128.4k');
    expect(screen.getByText('Last 28 days')).toBeInTheDocument();
    expect(screen.getByText('Live').parentElement).toHaveClass('ml-auto');
    await expectNoA11yViolations(container);
  });

  it('keeps an empty zero value in the stacked chip definition list', async () => {
    const { container } = render(
      <ContentMetricCard
        layout='icon-chip'
        icon={Eye}
        label='Total streams'
        value={0}
        subtitle='No streams in the last 28 days'
      />
    );

    const term = screen.getByRole('term');
    expect(term).toHaveTextContent('Total streams');
    const [value, subtitle] = screen.getAllByRole('definition');
    expect(value).toHaveTextContent('0');
    expect(subtitle).toHaveTextContent('No streams in the last 28 days');
    await expectNoA11yViolations(container);
  });

  it('tints the inline chip for the error tone', async () => {
    const { container } = render(
      <ContentMetricCard
        layout='icon-chip-inline'
        tone='error'
        icon={AlertTriangle}
        label='Failed payouts'
        value={3}
      />
    );

    const chip = container.querySelector('[aria-hidden="true"]');
    expect(chip).toHaveClass('bg-error/10', 'rounded-full');
    expect(chip?.querySelector('svg')).toHaveClass('text-error');
    expect(screen.getByRole('definition')).toHaveTextContent('3');
    await expectNoA11yViolations(container);
  });

  it('renders a partial card without optional slots and an RTL card', async () => {
    const { container } = render(
      <div>
        <ContentMetricCard layout='icon-chip' label='Saves' value='2.1k' />
        <div dir='rtl' lang='ar'>
          <ContentMetricCard
            layout='icon-chip'
            density='compact'
            icon={Eye}
            label='إجمالي الاستماعات'
            value='128.4k'
            subtitle='آخر 28 يومًا'
          />
        </div>
      </div>
    );

    const [partialList] = container.querySelectorAll('dl');
    expect(partialList.querySelectorAll('dd')).toHaveLength(1);
    expect(partialList.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByText('إجمالي الاستماعات')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
