import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingMetricCard } from './MarketingMetricCard';

const icon = <span aria-hidden='true'>•</span>;

describe('MarketingMetricCard certificate', () => {
  it('renders the label and value alone axe-clean', async () => {
    const { container } = render(
      <MarketingMetricCard
        icon={icon}
        label='Next drop'
        value='Friday'
        testId='metric'
      />
    );

    expect(screen.getByTestId('metric')).toHaveTextContent('Next drop');
    expect(screen.getByText('Friday')).toBeInTheDocument();
    expect(screen.getByTestId('metric').childElementCount).toBe(2);
    await expectNoA11yViolations(container);
  });

  it('renders the aside and description when passed', async () => {
    const { container } = render(
      <MarketingMetricCard
        icon={icon}
        label='Momentum'
        value='Building'
        valueAside='Presave is open'
        description='Capture intent before release day.'
        testId='metric'
        valueAsideClassName='aside-extra'
      />
    );

    expect(screen.getByText('Presave is open')).toHaveClass('aside-extra');
    expect(
      screen.getByText('Capture intent before release day.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('metric').childElementCount).toBe(3);
    await expectNoA11yViolations(container);
  });

  it('keeps right-to-left copy axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingMetricCard
          icon={icon}
          label='الإصدار القادم'
          value='الجمعة'
        />
      </div>
    );
    expect(screen.getByText('الجمعة')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
