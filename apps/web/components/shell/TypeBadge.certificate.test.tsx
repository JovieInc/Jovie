import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TypeBadge } from './TypeBadge';

describe('TypeBadge certificate', () => {
  it('renders a decorative type pill axe-clean', async () => {
    const { container } = render(<TypeBadge label='single' />);
    const badge = screen.getByText('single');
    expect(badge.tagName).toBe('SPAN');
    expect(badge).toHaveClass('shrink-0', 'capitalize');
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL labels axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <TypeBadge label='deluxe anniversary edition' />
        <TypeBadge label='ألبوم' className='ms-1' />
      </div>
    );
    expect(screen.getByText('deluxe anniversary edition')).toBeInTheDocument();
    expect(screen.getByText('ألبوم')).toHaveClass('ms-1');
    await expectNoA11yViolations(container);
  });
});
