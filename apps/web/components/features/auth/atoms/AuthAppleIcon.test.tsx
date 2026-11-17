import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AuthAppleIcon } from './AuthAppleIcon';

describe('AuthAppleIcon certificate', () => {
  it('renders a decorative glyph at the default size', async () => {
    const { container } = render(
      <button type='button'>
        <AuthAppleIcon />
        Continue with Apple
      </button>
    );

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(svg).toHaveClass('h-4', 'w-4');
    await expectNoA11yViolations(container);
  });

  it('replaces the default size with a caller class', async () => {
    const { container } = render(<AuthAppleIcon className='h-6 w-6' />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('h-6', 'w-6');
    expect(svg).not.toHaveClass('h-4');
    await expectNoA11yViolations(container);
  });
});
