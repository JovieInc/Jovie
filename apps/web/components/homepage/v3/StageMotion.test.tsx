import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
  it('zooms each stage to the content box between 1024 and 1439', () => {
    const zoomed = { value: true };
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('reduce') ? false : zoomed.value,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    document.body.innerHTML = `
      <section class="hv3"><div class="hv3-rule" style="padding-left: 96px"></div></section>`;
    const section = document.querySelector('.hv3') as HTMLElement;
    Object.defineProperty(section, 'clientWidth', { value: 1280 });
    document.documentElement.style.fontSize = '16px';
    render(<StageMotion paletteQuery='releases' paletteTarget='Releases' />);
    // (1280 - 2 x 96) / (78 x 16) = 1088 / 1248
    expect(Number(section.style.getPropertyValue('--hv3-z'))).toBeCloseTo(
      1088 / 1248,
      6
    );
    zoomed.value = false;
    window.dispatchEvent(new Event('resize'));
    expect(section.style.getPropertyValue('--hv3-z')).toBe('');
    document.documentElement.style.fontSize = '';
  });

  it('turns motion on, and off again on unmount', async () => {
    mockReducedMotion(false);
    const { container, unmount } = render(
      <StageMotion paletteQuery='releases' paletteTarget='Releases' />
    );
    expect(document.documentElement).toHaveClass('hv3-motion');
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
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

  it('keeps everything still under prefers-reduced-motion', async () => {
    mockReducedMotion(true);
    const { container } = render(
      <StageMotion paletteQuery='releases' paletteTarget='Releases' />
    );
    expect(document.documentElement).not.toHaveClass('hv3-motion');
    await expectNoA11yViolations(container);
  });

  it('keeps a callout label inside its section frame guides', () => {
    mockReducedMotion(true);
    document.body.innerHTML = `
      <section class="hv3-chapter">
        <div class="hv3-rule" style="padding-left: 96px"></div>
        <div id="stage">
          <i data-hv3-anchor="near"></i><i data-hv3-anchor="far"></i>
          <div data-hv3-callout="near" class="hv3-callout hv3-callout--l">
            <i class="hv3-callout__node"></i>
            <span class="hv3-callout__leader"></span>
            <span class="hv3-mono">row</span>
          </div>
          <div data-hv3-callout="far" class="hv3-callout">
            <i class="hv3-callout__node"></i>
            <span class="hv3-callout__leader"></span>
            <span class="hv3-mono">one handle</span>
          </div>
        </div>
      </section>`;
    const section = document.querySelector('section') as HTMLElement;
    const stage = document.getElementById('stage') as HTMLElement;
    section.getBoundingClientRect = () => rect(0, 0, 1440, 900);
    stage.getBoundingClientRect = () => rect(0, 0, 1440, 900);
    Object.defineProperty(stage, 'offsetWidth', { value: 1440 });
    const anchors = { near: 239, far: 1299 } as const;
    for (const [id, left] of Object.entries(anchors)) {
      (
        document.querySelector(`[data-hv3-anchor="${id}"]`) as HTMLElement
      ).getBoundingClientRect = () => rect(left, 399);
    }
    // Node 9px, a 48px leader by default, a 100px label.
    for (const callout of document.querySelectorAll<HTMLElement>(
      '[data-hv3-callout]'
    )) {
      const leader = callout.querySelector('span') as HTMLElement;
      const leaderWidth = () =>
        leader.style.width ? Number.parseFloat(leader.style.width) : 48;
      Object.defineProperty(leader, 'offsetWidth', { get: leaderWidth });
      Object.defineProperty(callout, 'offsetWidth', {
        get: () => 9 + leaderWidth() + 100,
      });
      Object.defineProperty(callout, 'offsetParent', { value: stage });
    }
    render(<StageMotion paletteQuery='releases' paletteTarget='Releases' />);
    const [near, far] =
      document.querySelectorAll<HTMLElement>('[data-hv3-callout]');
    // 9px past the left guide: the leader gives up 9px and the label starts on it.
    expect(near.querySelector('span')?.style.width).toBe('39px');
    expect(near.style.transform).toBe('translate(97px, 400px)');
    // Far past the right guide: the leader shortens to its floor.
    expect(far.querySelector('span')?.style.width).toBe('16px');
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
