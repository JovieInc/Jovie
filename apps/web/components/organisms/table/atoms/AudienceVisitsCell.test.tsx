import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceVisitsCell } from './AudienceVisitsCell';

describe('AudienceVisitsCell', () => {
  it.each([
    ['high', 'High'],
    ['medium', 'Medium'],
    ['low', 'Low'],
  ] as const)(
    'shows the count with the %s intent badge',
    async (intentLevel, label) => {
      const { container } = render(
        <AudienceVisitsCell visits={12} intentLevel={intentLevel} />
      );

      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText(label)).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('shows a zero count and a long count', async () => {
    const { container, rerender } = render(
      <AudienceVisitsCell visits={0} intentLevel='low' className='custom' />
    );
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('custom');

    rerender(<AudienceVisitsCell visits={1284903} intentLevel='high' />);
    expect(screen.getByText('1284903')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AudienceVisitsCell visits={3} intentLevel='medium' />
      </div>
    );

    expect(screen.getByText('Medium')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
