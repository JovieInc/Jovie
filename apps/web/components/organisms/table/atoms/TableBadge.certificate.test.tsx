import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableBadge } from './TableBadge';

describe('TableBadge certificate', () => {
  it.each(['primary', 'secondary', 'success', 'warning', 'error'] as const)(
    'renders the %s variant axe-clean',
    async variant => {
      const { container } = render(
        <TableBadge variant={variant}>Status</TableBadge>
      );

      expect(screen.getByText('Status')).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('forwards size and className', async () => {
    const { container } = render(
      <TableBadge variant='warning' size='lg' className='custom-badge'>
        Awaiting distributor review before scheduled release
      </TableBadge>
    );

    const badge = screen.getByText(
      'Awaiting distributor review before scheduled release'
    );
    expect(badge.closest('.custom-badge')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with an RTL label', async () => {
    const { container } = render(
      <div dir='rtl'>
        <TableBadge variant='success'>نشط</TableBadge>
      </div>
    );

    expect(screen.getByText('نشط')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
