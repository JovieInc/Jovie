import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScrubGradient } from '../ScrubGradient';

describe('ScrubGradient', () => {
  it('renders the time labels for currentTime + duration', () => {
    const { getByText } = render(
      <ScrubGradient currentTime={78} duration={213} />
    );
    expect(getByText('1:18')).toBeInTheDocument();
    expect(getByText('3:33')).toBeInTheDocument();
  });

  it('renders 0:00 for NaN duration (audio metadata not yet loaded)', () => {
    const { getAllByText } = render(
      <ScrubGradient currentTime={NaN} duration={NaN} />
    );
    const zeros = getAllByText('0:00');
    expect(zeros.length).toBe(2);
  });

  it('renders the loop section band only when loopMode is section', () => {
    const off = render(
      <ScrubGradient
        currentTime={0}
        duration={100}
        loopMode='off'
        loopSection={{ from: 25, to: 50 }}
      />
    );
    expect(off.container.querySelector('rect.text-cyan-300')).toBeNull();
    off.unmount();

    const on = render(
      <ScrubGradient
        currentTime={0}
        duration={100}
        loopMode='section'
        loopSection={{ from: 25, to: 50 }}
      />
    );
    expect(on.container.querySelector('rect.text-cyan-300')).not.toBeNull();
  });

  it('uses per-instance SVG ids so multiple instances do not collide', () => {
    const { container } = render(
      <>
        <ScrubGradient currentTime={0} duration={100} />
        <ScrubGradient currentTime={0} duration={100} />
      </>
    );
    const grads = container.querySelectorAll(
      'linearGradient[id^="scrub-grad-"]'
    );
    expect(grads.length).toBe(2);
    expect(grads[0].getAttribute('id')).not.toBe(grads[1].getAttribute('id'));
  });
});
