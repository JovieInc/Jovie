import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { KpiItem } from './KpiItem';

describe('KpiItem certificate', () => {
  it('shows the label, value and metadata', async () => {
    const { container } = render(
      <KpiItem
        title='Waitlisted'
        value='1,842'
        metadata='+62 this week'
        icon={Users}
      />
    );

    expect(screen.getByText('Waitlisted')).toBeInTheDocument();
    expect(screen.getByText('1,842')).toBeInTheDocument();
    expect(screen.getByText('+62 this week')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders rich metadata nodes and a caller icon class', async () => {
    const { container } = render(
      <KpiItem
        title='Claimed'
        value='318'
        metadata={<span data-testid='trend'>+4%</span>}
        icon={Users}
        iconClassName='text-success'
      />
    );

    expect(screen.getByTestId('trend')).toHaveTextContent('+4%');
    expect(container.querySelector('svg.text-success')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long copy in the tile', async () => {
    const title =
      'Waitlisted creators awaiting a manual review before their invite goes out';
    const { container } = render(
      <KpiItem
        title={title}
        value='1,234,567,890'
        metadata='+62 this week across every acquisition channel'
        icon={Users}
      />
    );

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText('1,234,567,890')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <KpiItem
          title='قائمة الانتظار'
          value='١٬٨٤٢'
          metadata='+٦٢ هذا الأسبوع'
          icon={Users}
        />
      </div>
    );

    expect(screen.getByText('قائمة الانتظار')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
