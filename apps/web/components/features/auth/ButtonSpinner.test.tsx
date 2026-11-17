import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ButtonSpinner } from './ButtonSpinner';

describe('ButtonSpinner certificate', () => {
  it('renders a decorative spinner hidden from assistive tech', async () => {
    const { container } = render(
      <button type='button' aria-busy='true'>
        <ButtonSpinner />
        Saving
      </button>
    );

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('h-4', 'w-4', 'animate-spin');
    expect(svg).toHaveClass('motion-reduce:animate-none');
    await expectNoA11yViolations(container);
  });

  it('merges a caller class', async () => {
    const { container } = render(<ButtonSpinner className='h-5 w-5' />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('h-5', 'w-5', 'animate-spin');
    await expectNoA11yViolations(container);
  });
});
