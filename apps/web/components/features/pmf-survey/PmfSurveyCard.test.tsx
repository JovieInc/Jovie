import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PmfSurveyCard } from './PmfSurveyCard';

function setup(
  overrides: {
    onSubmit?: () => Promise<{ ok: boolean }>;
    onDismiss?: () => Promise<{ ok: boolean }>;
  } = {}
) {
  const onSubmit = vi.fn(overrides.onSubmit ?? (async () => ({ ok: true })));
  const onDismiss = vi.fn(overrides.onDismiss ?? (async () => ({ ok: true })));
  render(
    <PmfSurveyCard initialExpanded onDismiss={onDismiss} onSubmit={onSubmit} />
  );
  return { onSubmit, onDismiss };
}

describe('PmfSurveyCard', () => {
  it('keeps the question discoverable and opens the form with the keyboard without recording an answer', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onDismiss = vi.fn();
    render(<PmfSurveyCard onSubmit={onSubmit} onDismiss={onDismiss} />);
    const answer = screen.getByRole('button', { name: 'Answer' });
    expect(screen.getByRole('region')).toHaveAccessibleName(
      'How would you feel if you could no longer use Jovie?'
    );
    expect(answer).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await user.tab();
    expect(answer).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(answer).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('radio', { name: 'Very Disappointed' })
    ).toBeVisible();
    await user.click(
      screen.getByRole('radio', { name: 'Somewhat Disappointed' })
    );
    await user.type(screen.getByLabelText(/main benefit/), 'Release planning');
    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(answer).toHaveFocus();
    await user.keyboard(' ');
    expect(
      screen.getByRole('radio', { name: 'Somewhat Disappointed' })
    ).toBeChecked();
    expect(screen.getByLabelText(/main benefit/)).toHaveValue(
      'Release planning'
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('can dismiss the compact prompt without opening or answering it', () => {
    const onDismiss = vi.fn().mockResolvedValue({ ok: true });
    const onSubmit = vi.fn();
    render(<PmfSurveyCard onSubmit={onSubmit} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('pmf-survey-card')).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('asks the Sean Ellis question with its three answers', () => {
    setup();
    expect(
      screen.getByRole('region', {
        name: 'How would you feel if you could no longer use Jovie?',
      })
    ).toBeInTheDocument();
    for (const label of [
      'Very Disappointed',
      'Somewhat Disappointed',
      'Not Disappointed',
    ]) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
    expect(
      screen.getByLabelText(/What is the main benefit you get/)
    ).toBeInTheDocument();
  });

  it('asks for an answer on send instead of greying out the button', () => {
    const { onSubmit } = setup();
    const send = screen.getByRole('button', { name: 'Send answer' });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Pick an answer first.'
    );
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'Very Disappointed' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sends the answer with the trimmed benefit and thanks the user', async () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Very Disappointed' }));
    fireEvent.change(screen.getByLabelText(/main benefit/), {
      target: { value: '  Every release in one link  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    await waitFor(() =>
      expect(screen.getByText('Thanks for answering')).toBeInTheDocument()
    );
    expect(onSubmit).toHaveBeenCalledWith({
      response: 'very_disappointed',
      mainBenefit: 'Every release in one link',
    });
  });

  it('sends a null benefit when the optional field is empty', async () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Not Disappointed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith({
      response: 'not_disappointed',
      mainBenefit: null,
    });
  });

  it('keeps the answer and offers a retry when saving fails', async () => {
    setup({ onSubmit: async () => ({ ok: false }) });
    fireEvent.click(
      screen.getByRole('radio', { name: 'Somewhat Disappointed' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your answer was not saved. Try again.'
    );
    expect(
      screen.getByRole('radio', { name: 'Somewhat Disappointed' })
    ).toBeChecked();
    expect(screen.getByRole('button', { name: 'Send answer' })).toBeEnabled();
  });

  it('keeps pending feedback open until a failed submission can be retried', async () => {
    let complete!: (value: { ok: boolean }) => void;
    setup({
      onSubmit: () =>
        new Promise(resolve => {
          complete = resolve;
        }),
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Very Disappointed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(screen.getByRole('button', { name: 'Sending' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hide' })).toBeDisabled();
    complete({ ok: false });
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hide' })).toBeEnabled();
  });

  it('hides at once on dismiss and records the dismissal', () => {
    const { onDismiss, onSubmit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('pmf-survey-card')).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('closes the thank-you without counting a dismissal', async () => {
    const { onDismiss } = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Very Disappointed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
    await screen.findByText('Thanks for answering');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('pmf-survey-card')).not.toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
