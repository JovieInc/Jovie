import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MoonIcon, SunIcon } from './ThemeIcons';

describe('ThemeIcons', () => {
  it('renders decorative icons with the default size', async () => {
    const { container } = render(
      <button type='button'>
        <SunIcon />
        <MoonIcon />
        Toggle theme
      </button>
    );

    const icons = container.querySelectorAll('svg');
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).toHaveAttribute('class', 'h-4 w-4');
      expect(icon).toHaveAttribute('fill', 'currentColor');
    }
    expect(
      screen.getByRole('button', { name: 'Toggle theme' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('applies a caller class name', async () => {
    const { container } = render(
      <div>
        <SunIcon className='h-5 w-5 text-secondary-token' />
        <MoonIcon className='h-6 w-6' />
      </div>
    );

    const [sun, moon] = Array.from(container.querySelectorAll('svg'));
    expect(sun).toHaveAttribute('class', 'h-5 w-5 text-secondary-token');
    expect(moon).toHaveAttribute('class', 'h-6 w-6');
    await expectNoA11yViolations(container);
  });
});
