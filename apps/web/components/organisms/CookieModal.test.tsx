import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mockMobile = vi.hoisted(() => ({ value: false }));
const mockSaveConsent = vi.hoisted(() => vi.fn());

vi.mock('@/lib/cookies/consent', () => ({
  saveConsent: mockSaveConsent,
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockMobile.value,
}));

import { CookieModal } from './CookieModal';

function renderModal() {
  const onClose = vi.fn();
  const onSave = vi.fn();
  const view = render(<CookieModal open onClose={onClose} onSave={onSave} />);
  return { ...view, onClose, onSave };
}

describe('CookieModal', () => {
  beforeEach(() => {
    mockMobile.value = false;
    mockSaveConsent.mockReset();
    mockSaveConsent.mockResolvedValue(undefined);
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['desktop dialog', false],
    ['mobile sheet', true],
  ])(
    'saves only the categories the visitor turns on (%s)',
    async (_label, mobile) => {
      mockMobile.value = mobile;
      const user = userEvent.setup();
      const { baseElement, onClose, onSave } = renderModal();
      await expectNoA11yViolations(baseElement);

      const essential = screen.getByRole('switch', { name: 'Essential' });
      expect(essential).toBeChecked();
      expect(essential).toBeDisabled();

      await user.click(screen.getByRole('switch', { name: 'Analytics' }));
      expect(screen.getByRole('switch', { name: 'Analytics' })).toBeChecked();
      expect(
        screen.getByRole('switch', { name: 'Marketing' })
      ).not.toBeChecked();

      await user.click(
        screen.getByRole('button', { name: 'Save Preferences' })
      );

      const consent = { essential: true, analytics: true, marketing: false };
      await waitFor(() => expect(onSave).toHaveBeenCalledWith(consent));
      expect(mockSaveConsent).toHaveBeenCalledWith(consent);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps the dialog open and announces a failed save', async () => {
    mockSaveConsent.mockRejectedValue(new Error('Consent cookie write failed'));
    const user = userEvent.setup();
    const { baseElement, onClose, onSave } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Save Preferences' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not save preferences. Check your connection and try again.'
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Save Preferences' })
    ).toBeEnabled();
    await expectNoA11yViolations(baseElement);

    // Changing a choice clears the stale error.
    await user.click(screen.getByRole('switch', { name: 'Marketing' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closes without saving on Cancel', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(mockSaveConsent).not.toHaveBeenCalled();
  });

  it('falls back to optional categories off when storage is blocked', async () => {
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: true, marketing: true })
    );
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    const { baseElement } = renderModal();

    expect(screen.getByRole('switch', { name: 'Analytics' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Marketing' })).not.toBeChecked();
    await expectNoA11yViolations(baseElement);
  });

  it('stays accessible in a right-to-left document', async () => {
    document.documentElement.setAttribute('dir', 'rtl');
    try {
      const { baseElement } = renderModal();
      expect(
        screen.getByRole('dialog', { name: 'Cookie Preferences' })
      ).toBeVisible();
      await expectNoA11yViolations(baseElement);
    } finally {
      document.documentElement.removeAttribute('dir');
    }
  });
});
