import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceDeviceCell } from './AudienceDeviceCell';

describe('AudienceDeviceCell', () => {
  it.each([
    ['mobile', 'Mobile'],
    ['iPad', 'Tablet'],
    ['desktop', 'Desktop'],
  ])(
    'labels a %s device as %s and stays axe-clean',
    async (deviceType, label) => {
      const { container } = render(
        <AudienceDeviceCell deviceType={deviceType} />
      );

      expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('shows a dash for an unknown or missing device and stays axe-clean', async () => {
    const { container, rerender } = render(
      <AudienceDeviceCell deviceType={null} className='custom-cell' />
    );

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('custom-cell');
    await expectNoA11yViolations(container);

    rerender(<AudienceDeviceCell deviceType='a very long unmatched device' />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders inside a right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AudienceDeviceCell deviceType='tablet' />
      </div>
    );

    expect(screen.getByRole('img', { name: 'Tablet' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
