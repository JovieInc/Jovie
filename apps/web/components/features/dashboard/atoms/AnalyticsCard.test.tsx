import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AnalyticsCard } from './AnalyticsCard';

describe('AnalyticsCard certificate', () => {
  it('renders the card variant as a labelled region with value and metadata', async () => {
    const { container } = render(
      <AnalyticsCard
        title='Profile Views'
        value='12,483'
        icon={Users}
        metadata='+12% vs last month'
        headerRight={<span>7d</span>}
      />
    );

    const region = screen.getByRole('region', { name: 'Profile Views metric' });
    expect(region).toHaveTextContent('Profile Views');
    expect(region).toHaveTextContent('12,483');
    expect(region).toHaveTextContent('+12% vs last month');
    expect(region).toHaveTextContent('7d');
    await expectNoA11yViolations(container);
  });

  it('renders partial data with only a title and value', async () => {
    const { container } = render(
      <AnalyticsCard title='Clicks' value={0} />
    );

    const region = screen.getByRole('region', { name: 'Clicks metric' });
    expect(region).toHaveTextContent('Clicks');
    expect(region).toHaveTextContent('0');
    expect(region.querySelector('svg')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('prefers children over metadata and honours a custom aria label', async () => {
    const { container } = render(
      <AnalyticsCard
        title='Fans'
        value='812'
        metadata='ignored metadata'
        ariaLabel='Fans this week'
      >
        <span>From children</span>
      </AnalyticsCard>
    );

    const region = screen.getByRole('region', { name: 'Fans this week' });
    expect(region).toHaveTextContent('From children');
    expect(region).not.toHaveTextContent('ignored metadata');
    await expectNoA11yViolations(container);
  });

  it('renders the hero variant flat with long content', async () => {
    const title = 'Monthly recurring revenue across every paid plan and add-on';
    const { container } = render(
      <AnalyticsCard
        variant='hero'
        title={title}
        value='$1,284,903'
        metadata='Up from last month'
        order='order-2'
      />
    );

    const region = screen.getByRole('region', { name: `${title} metric` });
    expect(region).toHaveClass('order-2');
    expect(screen.getByText('$1,284,903')).toBeInTheDocument();
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText('Up from last month')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays accessible in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AnalyticsCard title='مشاهدات الملف الشخصي' value='12,483' />
      </div>
    );

    expect(
      screen.getByRole('region', { name: 'مشاهدات الملف الشخصي metric' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
