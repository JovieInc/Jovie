import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { VerifiedBadge } from './VerifiedBadge';

describe('VerifiedBadge', () => {
  it('exposes one named image with a hover title and a decorative glyph', async () => {
    const user = userEvent.setup();
    const { container } = render(<VerifiedBadge />);

    const badge = screen.getByRole('img', { name: 'Verified Jovie Profile' });
    await user.hover(badge);
    expect(badge).toHaveAttribute('title', 'Verified Jovie Profile');
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('is not a tab stop between interactive neighbours', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div>
        <button type='button'>Before</button>
        <VerifiedBadge />
        <button type='button'>After</button>
      </div>
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it.each([
    ['sm', 'h-4'],
    ['md', 'h-4.5'],
    ['lg', 'h-5'],
  ] as const)('sizes the %s glyph with %s', (size, cls) => {
    const { container } = render(<VerifiedBadge size={size} />);
    expect(container.querySelector('svg')).toHaveClass(cls);
  });

  it('stays named beside long and right-to-left artist names', async () => {
    const { container } = render(
      <div>
        <p className='w-56'>
          Timothy White and the Very Long Sibling Ensemble Collective{' '}
          <VerifiedBadge size='sm' className='ms-1' />
        </p>
        <p dir='rtl'>
          فرقة الأصوات العربية المستقلة <VerifiedBadge size='sm' />
        </p>
      </div>
    );

    const badges = screen.getAllByRole('img', {
      name: 'Verified Jovie Profile',
    });
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveClass('ms-1');
    await expectNoA11yViolations(container);
  });
});
