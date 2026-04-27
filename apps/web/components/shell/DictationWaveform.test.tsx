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
});
