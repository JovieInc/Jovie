import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ScrubGradient } from './ScrubGradient';

describe('ScrubGradient', () => {
  it.each([
    {
      state: 'default',
      props: {
        currentTime: 78,
        duration: 213,
        onSeek: vi.fn(),
        cues: [{ at: 12, label: 'Intro' }],
      },
    },
    {
      state: 'read-only',
      props: { currentTime: 78, duration: 213 },
    },
  ])('has no axe violations when $state', async ({ props }) => {
    const { container } = render(<ScrubGradient {...props} />);
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in an RTL overflow frame', async () => {
    const { container } = render(
      <div dir='rtl' className='w-full max-w-md'>
        <ScrubGradient
          currentTime={40}
          duration={200}
          onSeek={vi.fn()}
          cues={[{ at: 18, label: 'مقدمة' }]}
        />
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it('uses HostDrawnInput for the seek control', () => {
    render(<ScrubGradient currentTime={10} duration={100} onSeek={vi.fn()} />);
    const slider = screen.getByRole('slider', { name: 'Seek Track Waveform' });
    expect(slider).toHaveAttribute('data-host-drawn');
    expect(slider).toHaveAttribute('type', 'range');
  });

  it('seeks when the range control changes', () => {
    const onSeek = vi.fn();
    render(<ScrubGradient currentTime={10} duration={100} onSeek={onSeek} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '42' } });
    expect(onSeek).toHaveBeenCalledWith(42);
  });

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
    expect(off.container.querySelector('rect.text-accent')).toBeNull();
    off.unmount();

    const on = render(
      <ScrubGradient
        currentTime={0}
        duration={100}
        loopMode='section'
        loopSection={{ from: 25, to: 50 }}
      />
    );
    expect(on.container.querySelector('rect.text-accent')).not.toBeNull();
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
    expect(grads[0]?.getAttribute('id')).not.toBe(grads[1]?.getAttribute('id'));
  });
});

describe('Ion accent polish (glm/lyrics-player)', () => {
  it('tints the loop-section band with the Ion accent, not raw cyan', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, './ScrubGradient.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/cyan-/);
    expect(source).toContain("className='text-accent'");
  });

  it('renders the loop section band when a section loop is active', () => {
    const { container } = render(
      <ScrubGradient
        currentTime={30}
        duration={213}
        loopMode='section'
        loopSection={{ from: 6, to: 23 }}
      />
    );
    const band = container.querySelector('rect.text-accent');
    expect(band).not.toBeNull();
  });

  it('hydrates a fractional playhead and cue title without a mismatch', async () => {
    const element = (
      <ScrubGradient
        currentTime={84}
        duration={222}
        onSeek={() => undefined}
        cues={[{ at: 12.5, label: 'Intro' }]}
        loopMode='section'
        loopSection={{ from: 6.25, to: 23.5 }}
      />
    );
    const host = document.createElement('div');
    host.innerHTML = renderToString(element);
    const errors: string[] = [];
    hydrateRoot(host, element, {
      onRecoverableError(error) {
        errors.push(error instanceof Error ? error.message : String(error));
      },
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(errors).toEqual([]);
    expect(host.querySelector('title')?.textContent).toBe('Intro · 0:27');
  });
});
