import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScrubGradient } from '../ScrubGradient';

describe('ScrubGradient', () => {
  it('renders the time labels for currentTime + duration', () => {
    const { getByText } = render(
      <ScrubGradient currentTime={78} duration={213} pct={36.6} />
    );
    expect(getByText('1:18')).toBeInTheDocument();
    expect(getByText('3:33')).toBeInTheDocument();
  });

  it('clamps a negative pct to the start of the bar', () => {
    const { container } = render(
      <ScrubGradient currentTime={0} duration={100} pct={-50} />
    );
    // Playhead line should be at x=0 after clamping.
    const line = container.querySelector('line');
    expect(line?.getAttribute('x1')).toBe('0');
  });

  it('renders the loop section band only when loopMode is section', () => {
    const off = render(
      <ScrubGradient
        currentTime={0}
        duration={100}
        pct={0}
        loopMode='off'
        loopSection={{ from: 25, to: 50 }}
      />
    );
    // The section band uses fill='currentColor' on a rect with text-cyan-300.
    expect(off.container.querySelector('rect.text-cyan-300')).toBeNull();
    off.unmount();

    const on = render(
      <ScrubGradient
        currentTime={0}
        duration={100}
        pct={0}
        loopMode='section'
        loopSection={{ from: 25, to: 50 }}
      />
    );
    expect(on.container.querySelector('rect.text-cyan-300')).not.toBeNull();
  });
});
