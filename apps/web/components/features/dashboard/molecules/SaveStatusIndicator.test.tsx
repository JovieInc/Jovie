import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SaveStatusIndicator } from './SaveStatusIndicator';

// Layout-shift guard (JOV-3800): the indicator must stay mounted with reserved
// height in every state so Saving… → Saved → idle never shifts settings forms.

function renderIndicator(status: {
  saving: boolean;
  success: boolean | null;
  error: string | null;
}) {
  const { container, unmount } = render(
    <SaveStatusIndicator status={status} />
  );
  return { indicator: container.firstElementChild as HTMLElement, unmount };
}

describe('SaveStatusIndicator', () => {
  it('keeps an invisible reserved-height container while idle instead of unmounting', () => {
    const { indicator } = renderIndicator({
      saving: false,
      success: null,
      error: null,
    });
    expect(indicator).not.toBeNull();
    expect(indicator.dataset.state).toBe('idle');
    expect(indicator.className).toContain('min-h-4');
    expect(indicator.className).toContain('invisible');
    expect(indicator.getAttribute('aria-live')).toBe('polite');
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
      const { indicator, unmount } = renderIndicator(status);
      expect(indicator.dataset.state).toBe(state);
      expect(indicator.className).toContain('min-h-4');
      expect(indicator.className).not.toContain('invisible');
      expect(indicator.textContent).toContain(text);
      unmount();
    }
  });
});
