import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DictationWaveform } from './DictationWaveform';

describe('DictationWaveform', () => {
  it('renders the default 32 bars', () => {
    const { container } = render(<DictationWaveform active />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.children.length).toBe(32);
  });

  it('honors a custom bar count', () => {
    const { container } = render(<DictationWaveform active bars={8} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.children.length).toBe(8);
  });

  it('disables per-bar animation when active is false', () => {
    const { container } = render(<DictationWaveform active={false} />);
    const root = container.firstElementChild as HTMLElement;
    const firstBar = root.children[0] as HTMLElement;
    expect(firstBar.style.animation).toBe('none');
    expect(firstBar.style.opacity).toBe('0.4');
  });

  it('animates each bar when active is true', () => {
    const { container } = render(<DictationWaveform active />);
    const root = container.firstElementChild as HTMLElement;
    const firstBar = root.children[0] as HTMLElement;
    expect(firstBar.style.animation).toContain('dict-bar');
    expect(firstBar.style.opacity).toBe('1');
  });

  // Source contract: bars carry the `dictation-waveform-bar` hook class so
  // globals.css can halt the inline animation under prefers-reduced-motion
  // (inline `animation` otherwise wins the cascade; JOV-5873).
  it('exposes the reduced-motion halting hook class on every bar', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(import.meta.dirname, 'DictationWaveform.tsx'),
      'utf8'
    );
    expect(source).toContain(
      "className='dictation-waveform-bar block w-1 rounded-full bg-cyan-300/85'"
    );
  });
});
