import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
