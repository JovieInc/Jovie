import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  MoonIcon,
  SmallMoonIcon,
  SmallSunIcon,
  SmallSystemIcon,
  SunIcon,
  SystemIcon,
} from './ThemeIcons';

describe('ThemeIcons', () => {
  it.each([
    ['SystemIcon', SystemIcon, 'h-5 w-5'],
    ['SunIcon', SunIcon, 'h-5 w-5'],
    ['MoonIcon', MoonIcon, 'h-5 w-5'],
    ['SmallSystemIcon', SmallSystemIcon, 'h-3.5 w-3.5'],
    ['SmallSunIcon', SmallSunIcon, 'h-3.5 w-3.5'],
    ['SmallMoonIcon', SmallMoonIcon, 'h-3.5 w-3.5'],
  ] as const)('%s is decorative and keeps its optical size', (_name, Icon, size) => {
    const { container } = render(<Icon />);
    const icon = container.querySelector('svg');

    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass(size);
  });

  it('allows an owning control to provide an instance class without changing semantics', () => {
    const { container } = render(<SunIcon className='text-primary-token' />);
    const icon = container.querySelector('svg');

    expect(icon).toHaveClass('text-primary-token');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
