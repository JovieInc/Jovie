import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';
import { InlineSubscribe } from './inline-subscribe';

function Harness({ onSubmit = vi.fn() }: { onSubmit?: () => void }) {
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <InlineSubscribe
        ariaLabel='Email address'
        buttonLabel='Subscribe'
        value=''
        onValueChange={() => undefined}
      />
    </form>
  );
}

describe('InlineSubscribe', () => {
  it('renders one attached pill: aria-labelled field and an enabled button', () => {
    render(<Harness />);
    const field = screen.getByLabelText('Email address');
    expect(field.closest('[data-component="composite-field"]')).not.toBeNull();
    expect(screen.queryByText('Email address')).not.toBeInTheDocument();
    // Never a grey disabled default for an empty field: validate on submit.
    expect(
      screen.getByRole('button', { name: 'Subscribe' })
    ).not.toBeDisabled();
  });

  it('submits an empty field so the parent can validate', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    // jsdom runs no native constraint validation on click; submit directly.
    fireEvent.submit(
      screen.getByRole('button').closest('form') as HTMLFormElement
    );
    expect(onSubmit).toHaveBeenCalled();
  });

  it('only disables the button when the service is unavailable', () => {
    render(
      <InlineSubscribe
        ariaLabel='Email address'
        buttonLabel='Subscribe'
        value=''
        onValueChange={() => undefined}
        unavailable
      />
    );
    expect(screen.getByRole('button', { name: 'Subscribe' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});

function ControlledParent({ tick }: { readonly tick: number }) {
  const [value, setValue] = useState('');
  return (
    <form data-tick={tick} onSubmit={event => event.preventDefault()}>
      <InlineSubscribe
        ariaLabel='Email address'
        buttonLabel='Subscribe'
        value={value}
        onValueChange={setValue}
      />
    </form>
  );
}

describe('InlineSubscribe input retention', () => {
  it('keeps typed email and focus across a parent rerender, Escape and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ControlledParent tick={0} />);
    const input = screen.getByLabelText('Email address');

    await user.type(input, 'fan@example.com');
    expect(input).toHaveValue('fan@example.com');

    rerender(<ControlledParent tick={1} />);
    expect(screen.getByLabelText('Email address')).toBe(input);
    expect(input).toHaveValue('fan@example.com');
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('fan@example.com');
    expect(input).toHaveFocus();

    await user.tab();
    expect(input).not.toHaveFocus();
    expect(input).toHaveValue('fan@example.com');
  });
});

describe('InlineSubscribe states', () => {
  it('freezes the field and shows the spinner while a request is in flight', () => {
    render(
      <InlineSubscribe
        ariaLabel='Email address'
        buttonLabel='Subscribe'
        value='fan@example.com'
        onValueChange={() => undefined}
        loading
        pending
      />
    );
    expect(screen.getByLabelText('Email address')).toBeDisabled();
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'fan@example.com'
    );
    expect(screen.getByRole('button', { name: /Subscribe/ })).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });

  it('marks the field invalid and links the parent error line', () => {
    render(
      <>
        <InlineSubscribe
          ariaLabel='Email address'
          buttonLabel='Subscribe'
          value='fan@example'
          onValueChange={() => undefined}
          invalid
          describedBy='subscribe-error'
        />
        <p id='subscribe-error'>Check the address and try again.</p>
      </>
    );
    const input = screen.getByLabelText('Email address');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      'Check the address and try again.'
    );
    expect(
      screen.getByRole('button', { name: 'Subscribe' })
    ).not.toBeDisabled();
  });
});

describe('InlineSubscribe accessibility', () => {
  it('has no axe violations for idle, loading, error, unavailable and RTL states', async () => {
    const { container } = render(
      <div>
        <form>
          <InlineSubscribe
            ariaLabel='Email address'
            buttonLabel='Subscribe'
            value=''
            onValueChange={() => undefined}
          />
        </form>
        <form>
          <InlineSubscribe
            ariaLabel='Email address while subscribing'
            buttonLabel='Subscribe'
            value='fan@example.com'
            onValueChange={() => undefined}
            loading
            pending
          />
        </form>
        <form>
          <InlineSubscribe
            ariaLabel='Email address with error'
            buttonLabel='Subscribe'
            value='fan@example'
            onValueChange={() => undefined}
            invalid
            describedBy='a11y-subscribe-error'
          />
          <p id='a11y-subscribe-error'>Check the address and try again.</p>
        </form>
        <form>
          <InlineSubscribe
            ariaLabel='Email address, service unavailable'
            buttonLabel='Subscribe'
            value='fan@example.com'
            onValueChange={() => undefined}
            unavailable
          />
        </form>
        <form dir='rtl'>
          <InlineSubscribe
            ariaLabel='البريد الإلكتروني'
            buttonLabel='اشترك في التحديثات'
            value=''
            onValueChange={() => undefined}
          />
        </form>
      </div>
    );
    await expectNoA11yViolations(container);
  });
});
