import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShellFrameDedupe } from './AppShellFrameDedupe';

function paintedRect(): DOMRect {
  return {
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    bottom: 600,
    right: 800,
    x: 0,
    y: 0,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

function paint(node: HTMLElement | null) {
  if (!node) return;
  node.getBoundingClientRect = () => paintedRect();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppShellFrameDedupe', () => {
  it('leaves the landmark on a single frame', () => {
    render(
      <>
        <AppShellFrameDedupe />
        <div data-testid='only-frame' data-app-shell-frame='true' ref={paint} />
      </>
    );

    expect(screen.getByTestId('only-frame')).toHaveAttribute(
      'data-app-shell-frame',
      'true'
    );
  });

  it('drops a display:none duplicate once another frame has a painted box', () => {
    render(
      <>
        <AppShellFrameDedupe />
        <div
          data-testid='stale-frame'
          data-app-shell-frame='true'
          style={{ display: 'none' }}
        />
        <div data-testid='live-frame' data-app-shell-frame='true' ref={paint} />
      </>
    );

    expect(screen.getByTestId('stale-frame')).not.toHaveAttribute(
      'data-app-shell-frame'
    );
    expect(screen.getByTestId('live-frame')).toHaveAttribute(
      'data-app-shell-frame',
      'true'
    );
  });

  it('drops a duplicate hidden by an ancestor once a sibling is painted', () => {
    render(
      <>
        <AppShellFrameDedupe />
        <div style={{ display: 'none' }}>
          <div data-testid='nested-stale' data-app-shell-frame='true' />
        </div>
        <div data-testid='live-frame' data-app-shell-frame='true' ref={paint} />
      </>
    );

    expect(screen.getByTestId('nested-stale')).not.toHaveAttribute(
      'data-app-shell-frame'
    );
    expect(screen.getByTestId('live-frame')).toHaveAttribute(
      'data-app-shell-frame',
      'true'
    );
  });

  it('drops a content-visibility:hidden duplicate once a sibling is painted', () => {
    render(
      <>
        <AppShellFrameDedupe />
        <div
          data-testid='cv-frame'
          data-app-shell-frame='true'
          style={{ contentVisibility: 'hidden' }}
        />
        <div data-testid='live-frame' data-app-shell-frame='true' ref={paint} />
      </>
    );

    expect(screen.getByTestId('cv-frame')).not.toHaveAttribute(
      'data-app-shell-frame'
    );
    expect(screen.getByTestId('live-frame')).toHaveAttribute(
      'data-app-shell-frame',
      'true'
    );
  });

  it('drops a visibility:hidden duplicate and keeps the painted frame', () => {
    render(
      <>
        <AppShellFrameDedupe />
        <div
          data-testid='invisible-frame'
          data-app-shell-frame='true'
          style={{ visibility: 'hidden' }}
        />
        <div data-testid='live-frame' data-app-shell-frame='true' ref={paint} />
      </>
    );

    expect(screen.getByTestId('invisible-frame')).not.toHaveAttribute(
      'data-app-shell-frame'
    );
    expect(screen.getByTestId('live-frame')).toHaveAttribute(
      'data-app-shell-frame',
      'true'
    );
  });

  it('keeps every landmark when every frame is non-layout hidden', () => {
    render(
      <>
        <AppShellFrameDedupe />
        <div
          data-testid='hidden-a'
          data-app-shell-frame='true'
          style={{ display: 'none' }}
        />
        <div
          data-testid='hidden-b'
          data-app-shell-frame='true'
          style={{ visibility: 'hidden' }}
        />
      </>
    );

    expect(screen.getByTestId('hidden-a')).toHaveAttribute(
      'data-app-shell-frame',
      'true'
    );
    expect(screen.getByTestId('hidden-b')).toHaveAttribute(
      'data-app-shell-frame',
      'true'
    );
  });

  it('keeps zero-size frames until one of them paints', async () => {
    render(
      <>
        <AppShellFrameDedupe />
        <div data-testid='unpainted-a' data-app-shell-frame='true' />
        <div data-testid='unpainted-b' data-app-shell-frame='true' />
      </>
    );

    expect(screen.getByTestId('unpainted-a')).toHaveAttribute(
      'data-app-shell-frame',
      'true'
    );
    expect(screen.getByTestId('unpainted-b')).toHaveAttribute(
      'data-app-shell-frame',
      'true'
    );

    paint(screen.getByTestId('unpainted-a'));
    screen
      .getByTestId('unpainted-a')
      .setAttribute('data-app-shell-frame', 'painted');

    await act(async () => {
      await new Promise(resolve => {
        setTimeout(resolve, 0);
      });
    });

    expect(screen.getByTestId('unpainted-a')).toHaveAttribute(
      'data-app-shell-frame',
      'painted'
    );
    expect(screen.getByTestId('unpainted-b')).not.toHaveAttribute(
      'data-app-shell-frame'
    );
  });

  it('strips a hidden frame added after mount', async () => {
    render(
      <>
        <AppShellFrameDedupe />
        <div data-testid='live-frame' data-app-shell-frame='true' ref={paint} />
      </>
    );

    const late = document.createElement('div');
    late.dataset.testid = 'late-hidden';
    late.setAttribute('data-app-shell-frame', 'true');
    late.style.display = 'none';
    document.body.append(late);

    await act(async () => {
      await new Promise(resolve => {
        setTimeout(resolve, 0);
      });
    });

    expect(late).not.toHaveAttribute('data-app-shell-frame');
    expect(screen.getByTestId('live-frame')).toHaveAttribute(
      'data-app-shell-frame',
      'true'
    );
    late.remove();
  });

  it('disconnects the shared observer after the last subscriber unmounts', () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const first = render(<AppShellFrameDedupe />);
    const second = render(<AppShellFrameDedupe />);

    first.unmount();
    expect(disconnect).not.toHaveBeenCalled();

    second.unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
