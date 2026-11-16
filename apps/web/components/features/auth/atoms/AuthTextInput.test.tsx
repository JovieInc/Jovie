import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AuthTextInput } from './AuthTextInput';

function Harness({ onChange }: { readonly onChange: (v: string) => void }) {
  const [, setTick] = useState(0);
  return (
    <>
      <AuthTextInput
        aria-label='Email address'
        placeholder='you@example.com'
        onChange={event => onChange(event.target.value)}
      />
      <button type='button' onClick={() => setTick(t => t + 1)}>
        Rerender
      </button>
    </>
  );
}

describe('AuthTextInput (auth re-export) certificate', () => {
  it('forwards typing to onChange and keeps the value across a rerender', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Email address' });
    await user.type(input, 'tim@jov.ie');
    expect(onChange).toHaveBeenLastCalledWith('tim@jov.ie');

    await user.click(screen.getByRole('button', { name: 'Rerender' }));
    expect(input).toHaveValue('tim@jov.ie');
    await expectNoA11yViolations(container);
  });

  it('renders the otp variant and forwards input props', async () => {
    const { container } = render(
      <AuthTextInput
        variant='otp'
        aria-label='One-time code'
        inputMode='numeric'
        disabled
      />
    );

    const input = screen.getByRole('textbox', { name: 'One-time code' });
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toBeDisabled();
    await expectNoA11yViolations(container);
  });
});
