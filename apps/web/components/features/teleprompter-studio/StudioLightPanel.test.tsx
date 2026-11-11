import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RingLightSettings } from '@/lib/teleprompter/ring-light';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { StudioLightPanel } from './StudioLightPanel';

const settings: RingLightSettings = {
  mode: 'edges',
  brightness: 0.8,
  warmth: 0.5,
  width: 48,
};

function preset(group: string, name: string) {
  const radiogroup = screen.getByRole('radiogroup', { name: group });
  return Array.from(radiogroup.querySelectorAll('[role="radio"]')).find(
    radio => radio.textContent === name
  ) as HTMLElement;
}

describe('StudioLightPanel', () => {
  it('shows brightness, warmth and edge width with the nearest preset picked', () => {
    render(<StudioLightPanel settings={settings} onChange={vi.fn()} />);

    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('48px')).toBeInTheDocument();
    expect(preset('Brightness', 'High')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(preset('Edge Width', 'Wide')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(preset('Edge Width', 'Thin')).not.toBeDisabled();
  });

  it('reports a brightness preset', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StudioLightPanel settings={settings} onChange={onChange} />);

    await user.click(preset('Brightness', 'Mid'));
    expect(onChange).toHaveBeenCalledWith({ ...settings, brightness: 0.7 });
  });

  it('reports a warmth preset and a mode change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StudioLightPanel settings={settings} onChange={onChange} />);

    await user.click(preset('Warmth', 'Cool'));
    expect(onChange).toHaveBeenCalledWith({ ...settings, warmth: 0 });
    await user.click(preset('Light Mode', 'Full White'));
    expect(onChange).toHaveBeenCalledWith({ ...settings, mode: 'full' });
  });

  it('locks edge width in full white mode', () => {
    render(
      <StudioLightPanel
        settings={{ ...settings, mode: 'full' }}
        onChange={vi.fn()}
      />
    );

    for (const name of ['Thin', 'Medium', 'Wide']) {
      expect(preset('Edge Width', name)).toBeDisabled();
    }
  });

  it('passes axe in edges and full white', async () => {
    for (const mode of ['edges', 'full'] as const) {
      const { container, unmount } = render(
        <StudioLightPanel settings={{ ...settings, mode }} onChange={vi.fn()} />
      );
      await expectNoA11yViolations(container);
      unmount();
    }
  });
});
