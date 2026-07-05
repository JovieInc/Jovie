import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsStatusPill } from './SettingsStatusPill';

// Layout-shift guard (JOV-3800): the pill must stay mounted with reserved
// height in every state so Saving… → Saved → idle never shifts settings forms.

function renderPill(status: {
  saving: boolean;
  success: boolean | null;
  error: string | null;
}) {
  const { container, unmount } = render(<SettingsStatusPill status={status} />);
  return { pill: container.firstElementChild as HTMLElement, unmount };
}

describe('SettingsStatusPill', () => {
  it('keeps an invisible reserved-height container while idle instead of unmounting', () => {
    const { pill } = renderPill({ saving: false, success: null, error: null });
    expect(pill).not.toBeNull();
    expect(pill.dataset.state).toBe('idle');
    expect(pill.className).toContain('min-h-4');
    expect(pill.className).toContain('invisible');
    expect(pill.getAttribute('aria-live')).toBe('polite');
  });

  it('renders every active state inside the same reserved-height container', () => {
    const cases = [
      {
        status: { saving: true, success: null, error: null },
        state: 'saving',
        text: 'Saving…',
      },
      {
        status: { saving: false, success: true, error: null },
        state: 'saved',
        text: 'Saved',
      },
      {
        status: { saving: false, success: null, error: 'Save failed hard' },
        state: 'error',
        text: 'Save failed hard',
      },
    ] as const;

    for (const { status, state, text } of cases) {
      const { pill, unmount } = renderPill(status);
      expect(pill.dataset.state).toBe(state);
      expect(pill.className).toContain('min-h-4');
      expect(pill.className).not.toContain('invisible');
      expect(pill.textContent).toContain(text);
      unmount();
    }
  });
});
