import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './input';

// Logical start/end spacing keeps the trailing slot and the required
// asterisk on the correct side in right-to-left layouts.
describe('Input RTL', () => {
  it('places the trailing slot and required asterisk with logical classes', () => {
    const { container } = render(
      <Input label='Email' required trailing={<span>@</span>} />
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('pe-10');
    expect(input).not.toHaveClass('pr-10');
    const slot = screen.getByText('@').parentElement?.parentElement;
    expect(slot).toHaveClass('end-2.5');
    expect(slot).not.toHaveClass('right-2.5');
    const asterisk = container.querySelector('label span[aria-hidden]');
    expect(asterisk).toHaveClass('ms-1');
    expect(asterisk).not.toHaveClass('ml-1');
  });
});
