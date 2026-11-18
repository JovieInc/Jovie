import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FormEvent, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DesktopAuthCodeForm } from './DesktopAuthCodeForm';
import type { RedeemState } from './desktop-auth-contract';

interface HarnessProps {
  readonly initialCode?: string;
  readonly onBack?: () => void;
  readonly onSubmit?: (code: string) => void;
  readonly redeemState?: RedeemState;
  readonly status?: string;
  readonly tick?: number;
}

/** Owns the code like DesktopAuthHandoffActions: state, ref and status line. */
function CodeFormHarness({
  initialCode = '',
  onBack = () => undefined,
  onSubmit = () => undefined,
  redeemState = 'idle',
  status = 'Enter the code shown in your browser.',
  tick = 0,
}: HarnessProps) {
  const [code, setCode] = useState(initialCode);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div data-tick={tick}>
      <DesktopAuthCodeForm
        cancelButton={null}
        inputRef={inputRef}
        onBack={onBack}
        onReturnCodeChange={value => setCode(value.toUpperCase())}
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          onSubmit(code);
        }}
        redeemState={redeemState}
        returnCode={code}
        statusId='desktop-auth-status'
      />
      <p id='desktop-auth-status' role='status'>
        {status}
      </p>
    </div>
  );
}

function codeInput() {
  return screen.getByRole('textbox', { name: 'Code From Your Browser' });
}

describe('DesktopAuthCodeForm states', () => {
  it('holds Continue until the code is complete, then submits it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = render(<CodeFormHarness onSubmit={onSubmit} />);

    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(codeInput()).toHaveValue('');
    expect(continueButton).toBeDisabled();
    await expectNoA11yViolations(container);

    await user.type(codeInput(), 'bcdf-ghjk');
    expect(codeInput()).toHaveValue('BCDF-GHJK');
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);
    expect(onSubmit).toHaveBeenCalledWith('BCDF-GHJK');
  });

  it('describes the field with the owner status line', async () => {
    const { container } = render(
      <CodeFormHarness status='That code did not match. Check it and try again.' />
    );

    expect(codeInput()).toHaveAccessibleDescription(
      'That code did not match. Check it and try again.'
    );
    expect(codeInput()).toHaveAttribute('autocomplete', 'one-time-code');
    expect(codeInput()).toHaveAttribute('maxlength', '9');
    await expectNoA11yViolations(container);
  });

  it('keeps the rejected code editable after a failed redeem', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CodeFormHarness
        initialCode='BCDF-GHJK'
        redeemState='error'
        status='Could not reach Jovie. Check your connection and try again.'
      />
    );

    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await user.clear(codeInput());
    await user.type(codeInput(), 'mnpq-rstv');
    expect(codeInput()).toHaveValue('MNPQ-RSTV');
    await expectNoA11yViolations(container);
  });

  it('locks the form while the code is redeeming and after it succeeds', async () => {
    const onBack = vi.fn();
    const { container, rerender } = render(
      <CodeFormHarness
        initialCode='BCDF-GHJK'
        onBack={onBack}
        redeemState='redeeming'
      />
    );

    expect(
      screen.getByRole('button', { name: 'Signing In...' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Back To Sign-in Options' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);

    rerender(
      <CodeFormHarness
        initialCode='BCDF-GHJK'
        onBack={onBack}
        redeemState='redeemed'
      />
    );
    expect(screen.getByTestId('desktop-auth-code-form')).toHaveAttribute(
      'data-desktop-auth-state',
      'code-complete'
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('returns to the sign-in options from Back', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<CodeFormHarness onBack={onBack} />);

    await user.click(
      screen.getByRole('button', { name: 'Back To Sign-in Options' })
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the typed code and focus through a parent re-render, Escape and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CodeFormHarness tick={0} />);

    const input = codeInput();
    await user.type(input, 'bcdf');
    rerender(<CodeFormHarness tick={1} status='Still waiting for the code.' />);

    expect(codeInput()).toBe(input);
    expect(input).toHaveValue('BCDF');
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('BCDF');
    expect(input).toHaveFocus();

    await user.tab();
    expect(input).not.toHaveFocus();
    expect(input).toHaveValue('BCDF');
  });

  it('has no axe violations in a right-to-left window', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <CodeFormHarness initialCode='BCDF-GHJK' />
      </div>
    );

    expect(codeInput()).toHaveValue('BCDF-GHJK');
    await expectNoA11yViolations(container);
  });
});
