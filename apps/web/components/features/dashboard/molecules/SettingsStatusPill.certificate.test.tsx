import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsStatusPill } from './SettingsStatusPill';

describe('SettingsStatusPill certificate', () => {
  it.each([
    ['saving', 'Saving…'],
    ['saved', 'Saved'],
    ['error', 'Save failed'],
  ] as const)('announces the %s state politely', async (state, text) => {
    const { container } = render(<SettingsStatusPill state={state} />);

    const pill = container.firstElementChild as HTMLElement;
    expect(pill).toHaveAttribute('data-state', state);
    expect(pill).toHaveAttribute('aria-live', 'polite');
    expect(pill).toHaveTextContent(text);
    await expectNoA11yViolations(container);
  });

  it('shows the server error and colours it as destructive', async () => {
    const { container } = render(
      <SettingsStatusPill
        status={{ saving: false, success: null, error: 'Handle is already taken' }}
      />
    );

    const pill = container.firstElementChild as HTMLElement;
    expect(pill).toHaveTextContent('Handle is already taken');
    expect(pill).toHaveClass('text-destructive');
    await expectNoA11yViolations(container);
  });

  it('prefers an explicit state over the status record', async () => {
    const { container } = render(
      <SettingsStatusPill
        state='saved'
        status={{ saving: true, success: null, error: null }}
      />
    );

    expect(container.firstElementChild).toHaveAttribute('data-state', 'saved');
    await expectNoA11yViolations(container);
  });

  it('keeps a long error and right-to-left copy accessible', async () => {
    const message =
      'We could not save your notification preferences because the connection dropped. Try again.';
    const { container } = render(
      <div dir='rtl'>
        <SettingsStatusPill
          status={{ saving: false, success: null, error: message }}
        />
        <SettingsStatusPill
          status={{ saving: false, success: null, error: 'تعذر الحفظ' }}
        />
      </div>
    );

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText('تعذر الحفظ')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
