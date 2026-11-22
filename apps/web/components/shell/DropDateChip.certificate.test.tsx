import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DropDateChip } from './DropDateChip';

describe('DropDateChip certificate', () => {
  it.each(['past', 'soon', 'future'] as const)(
    'keeps the %s tone axe-clean',
    async tone => {
      const { container } = render(
        <DropDateChip label='Drops Jun 20' tone={tone} />
      );

      expect(screen.getByText('Drops Jun 20')).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('keeps a long age label and a right-to-left label axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <DropDateChip label='2193d ago' tone='past' className='custom' />
      </div>
    );

    expect(screen.getByText('6y ago')).toBeInTheDocument();
    expect(container.querySelector('.custom')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
