import { render, screen } from '@testing-library/react';
import { Eye } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ContentMetricCard } from './ContentMetricCard';

describe('ContentMetricCard', () => {
  it('preserves the default metric and optional header content', () => {
    const { container } = render(
      <ContentMetricCard
        label='Streams'
        value='128.4k'
        icon={Eye}
        subtitle='Last 28 days'
        headerRight={<span>Live</span>}
      />
    );

    expect(screen.getByText('128.4k')).toHaveClass('tabular-nums');
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Last 28 days')).toBeInTheDocument();
    expect(container.querySelector('dl')).toBeNull();
  });

  it('groups a stacked icon chip, term, value and description in a definition list', () => {
    const { container } = render(
      <ContentMetricCard
        layout='icon-chip'
        label='QR Scans'
        value='1.2k'
        subtitle='Fans who scanned your QR'
        icon={Eye}
        tone='success'
        as='section'
        aria-label='QR Scans Metric'
      />
    );

    const term = screen.getByRole('term');
    const definitions = screen.getAllByRole('definition');
    expect(term).toHaveTextContent('QR Scans');
    expect(
      screen.getByRole('region', { name: 'QR Scans Metric' })
    ).toContainElement(term);
    expect(definitions.map(node => node.textContent)).toEqual([
      '1.2k',
      'Fans who scanned your QR',
    ]);
    expect(definitions[0]).toHaveClass('tabular-nums');
    expect(container.querySelector('dl')).toContainElement(term);
    const icon = container.querySelector('svg');
    expect(icon?.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(icon?.parentElement).toHaveClass('shrink-0', 'bg-surface-1');
    expect(icon).toHaveClass('text-success');
  });

  it('keeps the inline chip beside a shrinking label/value group, including zero', () => {
    const { container } = render(
      <ContentMetricCard
        layout='icon-chip-inline'
        label='Email Failures'
        tone='destructive'
        value={0}
        icon={Eye}
      />
    );

    const list = container.querySelector('dl');
    expect(list).toHaveClass('min-w-0');
    expect(list?.previousElementSibling).toHaveAttribute('aria-hidden', 'true');
    expect(list?.previousElementSibling).toHaveClass(
      'rounded-full',
      'shrink-0'
    );
    expect(screen.getByRole('term')).toHaveTextContent('Email Failures');
    expect(screen.getAllByRole('definition')).toHaveLength(1);
    expect(screen.getByRole('definition')).toHaveTextContent('0');
  });

  it('supports compact class overrides and composed values without requiring an icon', () => {
    const { container } = render(
      <ContentMetricCard
        layout='icon-chip'
        density='compact'
        label='Revenue'
        value={<span data-testid='hidden-amount'>•••</span>}
        headerRight={<span>Private</span>}
      />
    );

    expect(container.firstElementChild).toHaveClass('p-2.5');
    expect(container.firstElementChild).not.toHaveClass('p-3.5');
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.getByRole('definition')).toContainElement(
      screen.getByTestId('hidden-amount')
    );
    expect(screen.getByText('Private')).toBeInTheDocument();
  });
});
