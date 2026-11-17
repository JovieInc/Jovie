import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PublicSurfaceFooter } from './PublicSurfaceFooter';

describe('PublicSurfaceFooter', () => {
  it('renders its children above the safe-area inset', async () => {
    const { container } = render(
      <PublicSurfaceFooter>
        <nav aria-label='Profile Modes'>Modes</nav>
      </PublicSurfaceFooter>
    );

    const footer = container.firstElementChild as HTMLElement;
    expect(footer).toHaveClass('shrink-0');
    expect(footer.className).toContain('safe-area-inset-bottom');
    expect(
      screen.getByRole('navigation', { name: 'Profile Modes' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('merges a caller class without dropping its own', async () => {
    const { container } = render(
      <PublicSurfaceFooter className='mt-auto pt-6'>
        <p>Footer content</p>
      </PublicSurfaceFooter>
    );

    const footer = container.firstElementChild as HTMLElement;
    expect(footer).toHaveClass('mt-auto', 'pt-6', 'shrink-0');
    expect(screen.getByText('Footer content')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
