import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AppShellFrameDedupe } from './AppShellFrameDedupe';

function paint(node: HTMLElement | null) {
  if (!node) return;
  node.getBoundingClientRect = () =>
    ({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('AppShellFrameDedupe certificate', () => {
  it('keeps a lone frame and its main landmark axe-clean', async () => {
    const { container } = render(
      <>
        <AppShellFrameDedupe />
        <div data-testid='only-frame' data-app-shell-frame='true' ref={paint}>
          <main id='main-content'>Chat</main>
        </div>
      </>
    );

    expect(screen.getByTestId('only-frame')).toHaveAttribute(
      'data-app-shell-frame',
      'true'
    );
    expect(screen.getAllByRole('main')).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('leaves one main landmark and one copy of the text after dropping a retained shell', async () => {
    const { container } = render(
      <>
        <AppShellFrameDedupe />
        <div
          data-testid='stale-frame'
          data-app-shell-frame='true'
          hidden
          style={{ display: 'flex' }}
        >
          <main id='main-content'>Assistant reply</main>
        </div>
        <div data-testid='live-frame' data-app-shell-frame='true' ref={paint}>
          <main id='main-content'>Assistant reply</main>
        </div>
      </>
    );

    const stale = screen.getByTestId('stale-frame');
    expect(stale).not.toHaveAttribute('data-app-shell-frame');
    expect(stale).toHaveAttribute('aria-hidden', 'true');
    expect(stale.querySelector('#main-content')).toBeNull();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByText('Assistant reply')).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});
