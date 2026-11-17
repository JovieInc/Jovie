import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { nav } = vi.hoisted(() => ({ nav: { pathname: '/app' } }));

vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

vi.mock('next/dynamic', () => ({
  default: () =>
    function DevToolbarStub(props: {
      env: string;
      sha: string;
      version: string;
      defaultHidden: boolean;
    }) {
      return (
        <aside
          aria-label='Developer toolbar'
          data-env={props.env}
          data-sha={props.sha}
          data-version={props.version}
          data-default-hidden={String(props.defaultHidden)}
        />
      );
    },
}));

import { DevToolbarGate } from './DevToolbarGate';

const toolbar = () =>
  screen.queryByRole('complementary', { name: 'Developer toolbar' });

describe('DevToolbarGate certificate', () => {
  beforeEach(() => {
    nav.pathname = '/app';
    document.documentElement.style.setProperty('--dev-toolbar-height', '40px');
  });

  afterEach(() => {
    delete document.documentElement.dataset.desktopRuntime;
  });

  it('renders the toolbar in local development with its build props', async () => {
    const { container } = render(
      <DevToolbarGate env='development' sha='abc1234' version='1.2.3' />
    );

    const bar = toolbar();
    expect(bar).toHaveAttribute('data-sha', 'abc1234');
    expect(bar).toHaveAttribute('data-version', '1.2.3');
    expect(bar).toHaveAttribute('data-default-hidden', 'false');
    await expectNoA11yViolations(container);
  });

  it('starts the toolbar hidden on the chat route', () => {
    nav.pathname = '/app/chat/thread-1';
    render(<DevToolbarGate env='development' sha='a' version='1' />);

    expect(toolbar()).toHaveAttribute('data-default-hidden', 'true');
  });

  it.each([
    {
      label: 'production',
      env: 'production',
      pathname: '/app',
      disabled: false,
    },
    {
      label: 'a suppressed route',
      env: 'development',
      pathname: '/demo/releases',
      disabled: false,
    },
    {
      label: 'a disabled caller',
      env: 'development',
      pathname: '/app',
      disabled: true,
    },
  ])(
    'renders nothing and zeroes the height for $label',
    async ({ env, pathname, disabled }) => {
      nav.pathname = pathname;
      const { container } = render(
        <DevToolbarGate env={env} sha='a' version='1' disabled={disabled} />
      );

      expect(container).toBeEmptyDOMElement();
      expect(
        document.documentElement.style.getPropertyValue('--dev-toolbar-height')
      ).toBe('0px');
      await expectNoA11yViolations(container);
    }
  );

  it('hides the toolbar when the page switches to the desktop runtime', async () => {
    render(<DevToolbarGate env='development' sha='a' version='1' />);
    expect(toolbar()).not.toBeNull();

    await act(async () => {
      document.documentElement.dataset.desktopRuntime = 'electron';
      await Promise.resolve();
    });

    expect(toolbar()).toBeNull();
  });

  it('zeroes the height again on unmount', () => {
    const { unmount } = render(
      <DevToolbarGate env='development' sha='a' version='1' />
    );
    document.documentElement.style.setProperty('--dev-toolbar-height', '40px');
    unmount();

    expect(
      document.documentElement.style.getPropertyValue('--dev-toolbar-height')
    ).toBe('0px');
  });
});
