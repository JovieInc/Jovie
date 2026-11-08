import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StageMotion } from './StageMotion';

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() }))
  );
}

function rect(left: number, top: number, width = 2, height = 2): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('hv3-motion');
  document.body.innerHTML = '';
});

describe('StageMotion', () => {
  it('turns motion on, and off again on unmount', () => {
    mockReducedMotion(false);
    const { unmount } = render(
      <StageMotion paletteQuery='releases' paletteTarget='Releases' />
    );
    expect(document.documentElement).toHaveClass('hv3-motion');
    unmount();
    expect(document.documentElement).not.toHaveClass('hv3-motion');
  });

  it('moves the UPC callout with the inspector parallax on scroll', () => {
    mockReducedMotion(false);
    vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => {
      run(0);
      return 1;
    });
    document.body.innerHTML = `
      <div id="lift" data-hv3-parallax></div>
      <div id="host"><i data-hv3-anchor="a"></i><i data-hv3-anchor="b"></i>
      <svg data-hv3-connector="a>b"></svg></div>`;
    const host = document.getElementById('host') as HTMLElement;
    host.getBoundingClientRect = () => rect(0, 0, 800, 600);
    let anchorTop = 300;
    (
      document.querySelector('[data-hv3-anchor="a"]') as HTMLElement
    ).getBoundingClientRect = () => rect(100, anchorTop);
    (
      document.querySelector('[data-hv3-anchor="b"]') as HTMLElement
    ).getBoundingClientRect = () => rect(200, 100);
    render(<StageMotion paletteQuery='releases' paletteTarget='Releases' />);
    anchorTop = 280;
    Object.defineProperty(window, 'scrollY', {
      value: 400,
      configurable: true,
    });
    window.dispatchEvent(new Event('scroll'));
    expect(
      document.getElementById('lift')?.style.getPropertyValue('--hv3-par')
    ).toBe('-20px');
    expect(
      document.querySelector('svg[data-hv3-connector] path')?.getAttribute('d')
    ).toMatch(/^M100 280 /);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('keeps everything still under prefers-reduced-motion', () => {
    mockReducedMotion(true);
    render(<StageMotion paletteQuery='releases' paletteTarget='Releases' />);
    expect(document.documentElement).not.toHaveClass('hv3-motion');
  });

  it('draws the connector between its two projected anchors', () => {
    mockReducedMotion(true);
    document.body.innerHTML = `
      <div id="host"><i data-hv3-anchor="a"></i><i data-hv3-anchor="b"></i>
      <svg data-hv3-connector="a>b"></svg></div>`;
    const host = document.getElementById('host') as HTMLElement;
    host.getBoundingClientRect = () => rect(100, 100, 800, 600);
    (
      document.querySelector('[data-hv3-anchor="a"]') as HTMLElement
    ).getBoundingClientRect = () => rect(200, 300);
    (
      document.querySelector('[data-hv3-anchor="b"]') as HTMLElement
    ).getBoundingClientRect = () => rect(260, 140);
    render(<StageMotion paletteQuery='releases' paletteTarget='Releases' />);
    const path = document.querySelector('svg[data-hv3-connector] path');
    expect(path?.getAttribute('d')).toBe('M100 200 C130 200, 130 40, 160 40');
    expect(
      document.querySelectorAll('svg[data-hv3-connector] circle')
    ).toHaveLength(2);
  });
});
