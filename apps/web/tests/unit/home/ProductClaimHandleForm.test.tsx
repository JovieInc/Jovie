import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import { buildClaimProfileStartHref } from '@/data/marketingCtaIntents';

const { push, validation } = vi.hoisted(() => ({
  push: vi.fn(),
  validation: {
    handleError: null as string | null,
    checkingAvail: false,
    available: null as boolean | null,
    availError: null as string | null,
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/features/home/claim-handle/useHandleValidation', () => ({
  useHandleValidation: () => validation,
}));

function entry() {
  render(
    <ProductClaimHandleForm
      domain='jov.ie/'
      placeholder='you'
      submitLabel='Claim'
      testIdPrefix='homepage'
    />
  );
  const input = screen.getByRole('textbox', { name: 'Choose Your Handle' });
  fireEvent.change(input, { target: { value: 'Fixture-Artist' } });
  return { input, form: screen.getByTestId('homepage-claim-form') };
}

beforeEach(() => {
  push.mockReset();
  Object.assign(validation, {
    handleError: null,
    checkingAvail: false,
    available: null,
    availError: null,
  });
});

describe('homepage product claim entry', () => {
  function nameEntry(value: string) {
    render(
      <ProductClaimHandleForm
        domain='jov.ie/'
        placeholder='you'
        submitLabel='Claim'
        entryMode='name-or-handle'
        testIdPrefix='homepage'
      />
    );
    const input = screen.getByRole('textbox', { name: 'Your Name or Handle' });
    fireEvent.change(input, { target: { value } });
    return { input, form: screen.getByTestId('homepage-claim-form') };
  }

  it('accepts a normal name, shows the candidate explicitly and keeps both through submit', () => {
    const { input, form } = nameEntry('tim white');
    expect(input).toHaveValue('tim white');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(
      screen.getByText('Suggested address: jov.ie/tim-white')
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Claim' })).toBeEnabled();
    expect(new FormData(form as HTMLFormElement).get('entry')).toBe(
      'tim white'
    );
    expect(new FormData(form as HTMLFormElement).get('handle')).toBe(
      'tim-white'
    );
    expect(new FormData(form as HTMLFormElement).get('display_name')).toBe(
      'tim white'
    );
    fireEvent.submit(form);
    expect(push).toHaveBeenCalledExactlyOnceWith(
      buildClaimProfileStartHref('tim-white', 'tim white')
    );
    expect(input).toHaveValue('tim white');
    expect(input).toHaveAttribute('readonly');
  });

  it('retains a non-Latin name while an explicit address is edited', () => {
    const { input, form } = nameEntry('宇多田 ヒカル');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Address' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Profile Address' }), {
      target: { value: 'hikki' },
    });
    fireEvent.submit(form);
    expect(input).toHaveValue('宇多田 ヒカル');
    expect(push).toHaveBeenCalledExactlyOnceWith(
      buildClaimProfileStartHref('hikki', '宇多田 ヒカル')
    );
  });

  it('keeps incomplete typing quiet, then associates the submit error and focus', () => {
    validation.handleError = 'Handle must be at least 3 characters';
    const { input, form } = nameEntry('@t');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.submit(form);
    expect(push).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(
      screen.getByRole('alert').id
    );
  });

  it('does not submit partial IME composition or silently rewrite a pasted URL', () => {
    const { input, form } = nameEntry('Beyoncé Knowles');
    fireEvent.compositionStart(input);
    fireEvent.submit(form);
    expect(push).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.change(input, { target: { value: 'https://jov.ie/tim' } });
    fireEvent.submit(form);
    expect(push).not.toHaveBeenCalled();
    expect(input).toHaveValue('https://jov.ie/tim');
    expect(screen.getByRole('alert')).toHaveTextContent('rather than a link');
  });

  it('acknowledges Enter synchronously and sends one canonical intent for repeated submit events', () => {
    const { input, form } = entry();
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(push).toHaveBeenCalledExactlyOnceWith(
      buildClaimProfileStartHref('fixture-artist')
    );
    expect(screen.getByRole('button', { name: /opening/i })).toBeDisabled();
    expect(form).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('homepage-handle-status')).toHaveTextContent(
      'Opening setup for @fixture-artist'
    );
    expect(input).toHaveValue('fixture-artist');
  });

  it('recovers a failed navigation without discarding the handle and permits retry', () => {
    push.mockImplementationOnce(() => {
      throw new Error('navigation unavailable');
    });
    const { input, form } = entry();
    fireEvent.submit(form);
    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't open your profile setup. Try again."
    );
    expect(screen.getByRole('button', { name: 'Claim' })).toBeEnabled();
    expect(input).toHaveValue('fixture-artist');
    fireEvent.submit(form);
    expect(push).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /opening/i })).toBeDisabled();
  });

  it('restores a usable retained entry when Back returns the document', () => {
    const { input, form } = entry();
    fireEvent.submit(form);
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(screen.getByRole('button', { name: 'Claim' })).toBeEnabled();
    expect(input).toHaveValue('fixture-artist');
    fireEvent.submit(form);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('leaves unknown or unavailable ownership to the existing transactional route', () => {
    validation.available = false;
    const { form } = entry();
    expect(screen.getByTestId('homepage-handle-status')).toHaveTextContent(
      'Handle already taken'
    );
    fireEvent.submit(form);
    expect(push).toHaveBeenCalledExactlyOnceWith(
      buildClaimProfileStartHref('fixture-artist')
    );
    expect(screen.getByTestId('homepage-handle-status')).not.toHaveTextContent(
      /claimed|saved/i
    );
  });

  it('returns focus to invalid input without starting a request', () => {
    validation.handleError = 'Use at least 3 characters.';
    const { input, form } = entry();
    fireEvent.submit(form);
    expect(input).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Use at least 3 characters.'
    );
    expect(push).not.toHaveBeenCalled();
  });
});
