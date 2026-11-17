import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { Stat } from './Stat';

describe('Stat certificate', () => {
  it('pairs the caption with its value and stays axe-clean', async () => {
    const { container } = render(<Stat label='Clicks' value='1,247' />);
    expect(screen.getByText('Clicks')).toBeInTheDocument();
    expect(screen.getByText('1,247')).toHaveClass('text-primary-token');
    await expectNoA11yViolations(container);
  });

  it('renders an em dash placeholder for an empty value', async () => {
    const { container } = render(<Stat label='Saves' value='—' />);
    expect(screen.getByText('—')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long captions and values as plain text with tabular digits', async () => {
    const label = 'Pre-save conversions from every connected storefront';
    const value = '1,234,567,890 listeners across 214 territories';
    const { container } = render(<Stat label={label} value={value} tabular />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(value)).toHaveClass('tabular-nums');
    await expectNoA11yViolations(container);
  });

  it('renders mono values and RTL copy axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <Stat label='النقرات' value='١٬٢٤٧' />
        <Stat label='ISRC' value='USAT22300100' mono />
      </div>
    );
    expect(screen.getByText('النقرات')).toBeInTheDocument();
    expect(screen.getByText('USAT22300100')).toHaveClass('font-mono');
    await expectNoA11yViolations(container);
  });
});
