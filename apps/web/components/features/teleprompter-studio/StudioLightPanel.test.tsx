import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RingLightSettings } from '@/lib/teleprompter/ring-light';
import { StudioLightPanel } from './StudioLightPanel';

const settings: RingLightSettings = {
  mode: 'edges',
  brightness: 0.8,
  warmth: 0.5,
  width: 48,
};

describe('StudioLightPanel', () => {
  it('shows brightness, warmth and edge width', () => {
    render(<StudioLightPanel settings={settings} onChange={vi.fn()} />);

    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('48px')).toBeInTheDocument();
    expect(screen.getByLabelText(/Edge Width/)).not.toBeDisabled();
  });

  it('reports a brightness change', () => {
    const onChange = vi.fn();
    render(<StudioLightPanel settings={settings} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/Brightness/), {
      target: { value: '0.6' },
    });
    expect(onChange).toHaveBeenCalledWith({ ...settings, brightness: 0.6 });
  });

  it('locks edge width in full white mode', () => {
    render(
      <StudioLightPanel
        settings={{ ...settings, mode: 'full' }}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Edge Width/)).toBeDisabled();
  });
});
