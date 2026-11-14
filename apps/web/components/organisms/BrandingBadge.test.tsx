import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BrandingBadge } from './BrandingBadge';

describe('BrandingBadge certificate', () => {
  it('renders the fixed attribution line axe-clean', async () => {
    const { container } = render(<BrandingBadge />);

    const badge = screen.getByText('Made with Jovie');
    expect(badge).toBeVisible();
    expect(badge).toHaveClass('text-xs');
    expect(container.querySelectorAll('a, button')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('keeps the same line inside a right-to-left footer', async () => {
    const { container } = render(
      <div dir='rtl'>
        <BrandingBadge />
      </div>
    );

    expect(
      screen.getByText('Made with Jovie').closest('[dir]')
    ).toHaveAttribute('dir', 'rtl');
    await expectNoA11yViolations(container);
  });
});
