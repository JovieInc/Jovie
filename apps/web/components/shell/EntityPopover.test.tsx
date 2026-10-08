import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
import {
  EntityHoverLink,
  EntityPopover,
  type EntityPopoverData,
} from './EntityPopover';

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    unoptimized: _unoptimized,
    ...rest
  }: ComponentProps<'img'> & {
    fill?: boolean;
    unoptimized?: boolean;
  }) => <img src={src as string} alt={alt ?? ''} {...rest} />,
}));

const release = {
  kind: 'release',
  id: 'rel_1',
  label: 'Sober',
  artist: 'Jovie',
  releaseType: 'Single',
} satisfies EntityPopoverData;

const spotifyUrlArtist = {
  kind: 'artist',
  id: 'artist_1',
  label: 'https://open.spotify.com/artist/123',
  handle: 'https://open.spotify.com/artist/123',
} satisfies EntityPopoverData;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function advanceTimers(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('EntityHoverLink', () => {
  it('opens on hover and closes on mouse leave', () => {
    vi.useFakeTimers();
    fastRender(<EntityHoverLink entity={release}>Sober</EntityHoverLink>);
    const trigger = screen.getByRole('button', { name: 'Sober' });

    fireEvent.mouseEnter(trigger);
    advanceTimers(200);

    expect(screen.getByRole('tooltip').textContent).toContain('Sober');

    fireEvent.mouseLeave(trigger);
    advanceTimers(120);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('uses named shell tokens for the popover surface', () => {
    vi.useFakeTimers();
    fastRender(<EntityHoverLink entity={release}>Sober</EntityHoverLink>);
    const trigger = screen.getByRole('button', { name: 'Sober' });

    fireEvent.mouseEnter(trigger);
    advanceTimers(200);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveClass('rounded-xl', 'bg-surface-elevated', 'p-0');
    expect(tooltip.className).not.toContain('bg-(--linear-bg-surface-0)');
    expect(tooltip.className).not.toContain(
      'rounded-(--linear-app-radius-menu)'
    );
    // Padding cleanup: rail-aligned px-3 py-2.5 for premium compact popover
    expect(tooltip.firstElementChild).toHaveClass('px-3', 'py-2.5');
  });

  it('opens on focus and closes on Escape', () => {
    vi.useFakeTimers();
    fastRender(<EntityHoverLink entity={release}>Sober</EntityHoverLink>);
    const trigger = screen.getByRole('button', { name: 'Sober' });

    fireEvent.focus(trigger);
    advanceTimers(200);

    expect(screen.getByRole('tooltip').textContent).toContain('Sober');

    fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders Spotify URL fallbacks with the named provider icon token', () => {
    vi.useFakeTimers();
    fastRender(
      <EntityHoverLink entity={spotifyUrlArtist}>
        Spotify artist
      </EntityHoverLink>
    );
    const trigger = screen.getByRole('button', { name: 'Spotify artist' });

    fireEvent.focus(trigger);
    advanceTimers(200);

    expect(screen.getByRole('tooltip').textContent).toContain('Spotify artist');
    expect(
      screen.getByRole('tooltip').querySelector('.system-b-brand-spotify-glyph')
    ).not.toBeNull();
  });
});

describe('EntityPopover source contract', () => {
  it('keeps floating surface chrome on the shared token', () => {
    // Robust path: resolve relative to this test file (same dir as the source).
    // Prevents cwd-dependent breakage (package vs repo root invocation contexts).
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const source = readFileSync(
      resolve(__dirname, 'EntityPopover.tsx'),
      'utf8'
    );

    expect(source).toContain(
      "import { LINEAR_SURFACE } from '@/components/tokens/linear-surface';"
    );
    expect(source).toContain('LINEAR_SURFACE.popover');
    expect(source).toContain('system-b-brand-spotify-glyph');
    expect(source).not.toContain('#1DB954');
    expect(source).not.toContain("'rounded-lg border border-default'");
    expect(source).not.toContain("'bg-surface-0 text-primary-token");
    expect(source).not.toContain('zoom-in');
    expect(source).not.toContain('slide-in');
  });
});

describe('EntityPopover positioning', () => {
  function setup({
    left = 40,
    top = 310,
    width = 100,
    anchorHeight = 24,
    viewportWidth = 1024,
    viewportHeight = 360,
    contentHeight = 80,
  } = {}) {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    anchor.focus();
    vi.stubGlobal('innerWidth', viewportWidth);
    vi.stubGlobal('innerHeight', viewportHeight);
    const anchorRect = {
      top,
      bottom: top + anchorHeight,
      left,
      right: left + width,
      width,
      height: anchorHeight,
    } as DOMRect;
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(anchorRect);
    let height = contentHeight;
    // jsdom has no layout. Model the card's natural and constrained heights,
    // leaving positioning and event-driven updates to the real component.
    const renderedHeight = (element: HTMLElement) => {
      if (element.getAttribute('role') !== 'tooltip') return 0;
      const maxHeight = Number.parseFloat(element.style.maxHeight);
      return Number.isNaN(maxHeight) ? height : Math.min(height, maxHeight);
    };
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        return renderedHeight(this);
      }
    );
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        return renderedHeight(this);
      }
    );
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        return this.getAttribute('role') === 'tooltip' ? height : 0;
      }
    );
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      frames.delete(id);
    });
    const view = fastRender(<EntityPopover entity={release} anchor={anchor} />);
    return {
      anchor,
      anchorRect,
      view,
      grow: (nextHeight = 200) => {
        height = nextHeight;
      },
      resize: (nextWidth: number, nextHeight = viewportHeight) =>
        act(() => {
          vi.stubGlobal('innerWidth', nextWidth);
          vi.stubGlobal('innerHeight', nextHeight);
          window.dispatchEvent(new Event('resize'));
        }),
      flush: () =>
        act(() => {
          const pending = [...frames.values()];
          frames.clear();
          for (const callback of pending) callback(0);
        }),
      dispose: () => {
        view.unmount();
        anchor.remove();
      },
    };
  }

  function expectClearTriggerAndViewport(anchor: DOMRect) {
    const tooltip = screen.getByRole('tooltip');
    const left = Number.parseFloat(tooltip.style.left);
    const top = Number.parseFloat(tooltip.style.top);
    const right = left + Number.parseFloat(tooltip.style.width);
    const bottom = top + tooltip.offsetHeight;
    // The shared Button retains its existing 44px minimum hit container.
    const horizontalInset = Math.max(0, (44 - anchor.width) / 2);
    const verticalInset = Math.max(0, (44 - anchor.height) / 2);
    const intersectsHitTarget =
      left < anchor.right + horizontalInset &&
      right > anchor.left - horizontalInset &&
      top < anchor.bottom + verticalInset &&
      bottom > anchor.top - verticalInset;
    expect(intersectsHitTarget).toBe(false);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(right).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(bottom).toBeLessThanOrEqual(window.innerHeight - 8);
  }

  it.each([
    {
      name: 'compact left edge',
      left: 32,
      top: 284,
      viewportWidth: 390,
      side: 'top',
    },
    {
      name: 'compact right edge',
      left: 218,
      top: 284,
      viewportWidth: 390,
      side: 'top',
    },
    {
      name: 'compact top edge',
      left: 32,
      top: 0,
      viewportWidth: 390,
      side: 'bottom',
    },
    {
      name: 'compact bottom edge',
      left: 32,
      top: 332,
      viewportWidth: 390,
      side: 'top',
    },
    {
      name: 'narrow window',
      left: 32,
      top: 284,
      viewportWidth: 240,
      side: 'top',
    },
    {
      name: 'wide left edge',
      left: 32,
      top: 284,
      viewportWidth: 900,
      side: 'right',
    },
    {
      name: 'wide right edge',
      left: 700,
      top: 284,
      viewportWidth: 900,
      side: 'left',
    },
  ])(
    'keeps the $name trigger hit target clear',
    ({ left, top, viewportWidth, side }) => {
      const fixture = setup({
        left,
        top,
        width: 140,
        anchorHeight: 28,
        viewportWidth,
      });
      try {
        expectClearTriggerAndViewport(fixture.anchorRect);
        expect(screen.getByRole('tooltip')).toHaveAttribute('data-side', side);
        expect(fixture.anchor).toHaveFocus();
      } finally {
        fixture.dispose();
      }
    }
  );

  it('repositions on width changes without covering the trigger or moving focus', () => {
    const fixture = setup({
      left: 32,
      top: 284,
      width: 140,
      anchorHeight: 28,
      viewportWidth: 900,
    });
    try {
      expect(screen.getByRole('tooltip')).toHaveAttribute('data-side', 'right');
      fixture.resize(390);
      expectClearTriggerAndViewport(fixture.anchorRect);
      expect(screen.getByRole('tooltip')).toHaveAttribute('data-side', 'top');
      fixture.resize(900);
      expectClearTriggerAndViewport(fixture.anchorRect);
      expect(screen.getByRole('tooltip')).toHaveAttribute('data-side', 'right');
      expect(fixture.anchor).toHaveFocus();
    } finally {
      fixture.dispose();
    }
  });

  it('reserves the existing minimum hit area of a small button', () => {
    const fixture = setup({
      left: 32,
      top: 284,
      width: 22,
      anchorHeight: 22,
      viewportWidth: 900,
    });
    try {
      expectClearTriggerAndViewport(fixture.anchorRect);
      expect(screen.getByRole('tooltip')).toHaveAttribute('data-side', 'right');
      expect(fixture.anchor).toHaveFocus();
    } finally {
      fixture.dispose();
    }
  });

  it('follows a scrolled anchor without covering its hit area or moving focus', () => {
    const fixture = setup({
      left: 32,
      top: 284,
      width: 140,
      anchorHeight: 28,
      viewportWidth: 390,
    });
    try {
      fixture.anchorRect.top = 0;
      fixture.anchorRect.bottom = 28;
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });
      expectClearTriggerAndViewport(fixture.anchorRect);
      expect(screen.getByRole('tooltip')).toHaveAttribute(
        'data-side',
        'bottom'
      );
      expect(fixture.anchor).toHaveFocus();
    } finally {
      fixture.dispose();
    }
  });

  it('keeps tall content scrollable in a short window and releases the constraint after resize', () => {
    const fixture = setup({
      left: 32,
      top: 52,
      width: 140,
      anchorHeight: 28,
      viewportWidth: 390,
      viewportHeight: 144,
      contentHeight: 200,
    });
    try {
      expectClearTriggerAndViewport(fixture.anchorRect);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip.offsetHeight).toBeLessThan(tooltip.scrollHeight);
      expect(tooltip.style.overflowY).toBe('auto');
      fixture.resize(390, 844);
      expectClearTriggerAndViewport(fixture.anchorRect);
      expect(tooltip.offsetHeight).toBe(tooltip.scrollHeight);
      expect(fixture.anchor).toHaveFocus();
    } finally {
      fixture.dispose();
    }
  });

  it('keeps growing and shrinking metadata clear of the compact trigger', () => {
    const fixture = setup({
      left: 32,
      top: 184,
      width: 140,
      anchorHeight: 28,
      viewportWidth: 390,
    });
    try {
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveAttribute('data-side', 'bottom');
      fixture.grow();
      fixture.view.rerender(
        <EntityPopover
          entity={{ ...release, totalTracks: 12 }}
          anchor={fixture.anchor}
        />
      );
      expectClearTriggerAndViewport(fixture.anchorRect);
      expect(tooltip).toHaveAttribute('data-side', 'top');
      fixture.grow(80);
      fixture.view.rerender(
        <EntityPopover entity={release} anchor={fixture.anchor} />
      );
      expectClearTriggerAndViewport(fixture.anchorRect);
      expect(tooltip).toHaveAttribute('data-side', 'bottom');
      expect(fixture.anchor).toHaveFocus();
    } finally {
      fixture.dispose();
    }
  });

  it('keeps the first visible position stable when the deferred measure runs', () => {
    const fixture = setup();
    try {
      const tooltip = screen.getByRole('tooltip');
      const firstTop = tooltip.style.top;
      fixture.flush();
      expect(tooltip.style.top).toBe(firstTop);
    } finally {
      fixture.dispose();
    }
  });

  it('keeps refreshed taller content inside the viewport without stealing focus', () => {
    const fixture = setup();
    try {
      fixture.flush();
      fixture.grow();
      fixture.view.rerender(
        <EntityPopover
          entity={{ ...release, totalTracks: 12 }}
          anchor={fixture.anchor}
        />
      );
      const tooltip = screen.getByRole('tooltip');
      expect(
        Number.parseFloat(tooltip.style.top) + tooltip.offsetHeight
      ).toBeLessThanOrEqual(window.innerHeight);
      expect(fixture.anchor).toHaveFocus();
    } finally {
      fixture.dispose();
    }
  });
});
