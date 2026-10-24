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

  it('drops a hidden shell whose display is overridden and keeps one main landmark', () => {
    render(
      <>
        <AppShellFrameDedupe />
        <div
          data-testid='stale-frame'
          data-app-shell-frame='true'
          hidden
          style={{ display: 'flex' }}
        >
          <main id='main-content' data-testid='stale-main'>
            Stale
          </main>
        </div>
        <div data-testid='live-frame' data-app-shell-frame='true' ref={paint}>
          <main id='main-content' data-testid='live-main'>
            Live
          </main>
        </div>
      </>
    );

    expect(screen.getByTestId('stale-frame')).not.toHaveAttribute(
      'data-app-shell-frame'
    );
    expect(screen.getByTestId('stale-main')).not.toHaveAttribute('id');
    expect(screen.getByTestId('stale-frame')).toHaveTextContent('');
    expect(screen.getByTestId('live-frame')).toHaveTextContent('Live');
    expect(screen.getByTestId('live-main')).toHaveAttribute(
      'id',
      'main-content'
    );
    expect(screen.getByTestId('live-frame')).toHaveAttribute(
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

  it('drops duplicate test ids from a hidden shell before the kept frame has a box', () => {
    render(
      <>
        <AppShellFrameDedupe />
        <div
          data-testid='stale-frame'
          data-app-shell-frame='true'
          style={{ display: 'none' }}
        >
          <section data-testid='tasks-workspace'>Hidden tasks</section>
          <section data-testid='hidden-only'>Unique</section>
        </div>
        <div data-testid='live-frame' data-app-shell-frame='true'>
          <section data-testid='tasks-workspace'>Live tasks</section>
        </div>
      </>
    );

    expect(screen.getAllByTestId('tasks-workspace')).toHaveLength(1);
    expect(screen.getByTestId('tasks-workspace')).toHaveTextContent(
      'Live tasks'
    );
    expect(screen.getByTestId('hidden-only')).toBeInTheDocument();
    expect(screen.getByTestId('stale-frame')).toHaveTextContent('');
    expect(screen.getByTestId('stale-frame')).not.toHaveAttribute(
      'data-app-shell-frame'
    );
    expect(screen.getByTestId('live-frame')).toHaveAttribute(
      'data-app-shell-frame',
      'true'
    );
  });

  it('keeps duplicate test ids when every frame is painted', () => {
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(paintedRect());

    render(
      <>
        <AppShellFrameDedupe />
        <div data-testid='frame-a' data-app-shell-frame='true'>
          <section data-testid='tasks-workspace'>A</section>
        </div>
        <div data-testid='frame-b' data-app-shell-frame='true'>
          <section data-testid='tasks-workspace'>B</section>
        </div>
      </>
    );
    rectSpy.mockRestore();

    expect(screen.getAllByTestId('tasks-workspace')).toHaveLength(2);
    expect(screen.getByTestId('frame-a')).toHaveAttribute(
      'data-app-shell-frame',
      'true'
    );
    expect(screen.getByTestId('frame-b')).toHaveAttribute(
      'data-app-shell-frame',
      'true'
    );
  });

  async function flushMutations() {
    await act(async () => {
      await new Promise(resolve => {
        setTimeout(resolve, 0);
      });
    });
  }

  it('does not walk shell text when the live chat frame commits a message', async () => {
    render(
      <>
        <AppShellFrameDedupe />
        <div
          data-testid='stale-frame'
          data-app-shell-frame='true'
          hidden
          style={{ display: 'flex' }}
        >
          <p>Stale assistant paragraph</p>
        </div>
        <div data-testid='live-frame' data-app-shell-frame='true' ref={paint}>
          Live
        </div>
      </>
    );
    await flushMutations();

    expect(screen.getByTestId('stale-frame')).toHaveTextContent('');
    const stale = screen.getByTestId('stale-frame');
    const live = screen.getByTestId('live-frame');
    const walker = vi.spyOn(document, 'createTreeWalker');
    const style = vi.spyOn(window, 'getComputedStyle');
    walker.mockClear();
    style.mockClear();

    act(() => {
      live.append('Performance message 1');
    });
    await flushMutations();

    expect(
      walker.mock.calls.some(
        ([root]) => root === stale || stale.contains(root as Node)
      )
    ).toBe(false);
    expect(
      style.mock.calls.some(
        ([node]) =>
          node === live ||
          node === stale ||
          stale.contains(node as Node) ||
          live.contains(node as Node)
      )
    ).toBe(false);
    expect(screen.getByTestId('live-frame')).toHaveTextContent(
      'Performance message 1'
    );
    expect(screen.getByTestId('stale-frame')).toHaveTextContent('');
  });

  it('clears text that reappears in a suppressed shell without laying out the live frame', async () => {
    render(
      <>
        <AppShellFrameDedupe />
        <div
          data-testid='stale-frame'
          data-app-shell-frame='true'
          hidden
          style={{ display: 'flex' }}
        >
          <p>Stale assistant paragraph</p>
        </div>
        <div data-testid='live-frame' data-app-shell-frame='true' ref={paint}>
          Live
        </div>
      </>
    );
    await flushMutations();

    const style = vi.spyOn(window, 'getComputedStyle');
    style.mockClear();
    act(() => {
      screen.getByTestId('stale-frame').append('Generate album art paragraph');
    });
    await flushMutations();

    expect(style).not.toHaveBeenCalled();
    expect(screen.getByTestId('stale-frame')).toHaveTextContent('');
    expect(screen.getByTestId('live-frame')).toHaveTextContent('Live');
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
