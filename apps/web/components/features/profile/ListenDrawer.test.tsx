import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cloneElement, isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { ListenDrawer } from './ListenDrawer';

const hoisted = vi.hoisted(() => ({ track: vi.fn(), listen: vi.fn() }));

vi.mock('vaul', () => ({
  Drawer: {
    Root: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange: (isOpen: boolean) => void;
      children: React.ReactNode;
    }) =>
      open ? (
        <div>
          <button type='button' onClick={() => onOpenChange(false)}>
            Close drawer
          </button>
          {children}
        </div>
      ) : null,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Overlay: () => <div />,
    Content: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Title: ({
      children,
      asChild,
      ...props
    }: {
      children: React.ReactNode;
      asChild?: boolean;
    } & Record<string, unknown>) =>
      asChild && isValidElement(children) ? (
        cloneElement(children, props)
      ) : (
        <h2 {...props}>{children}</h2>
      ),
    Description: ({
      children,
      asChild,
      ...props
    }: {
      children: React.ReactNode;
      asChild?: boolean;
    } & Record<string, unknown>) =>
      asChild && isValidElement(children) ? (
        cloneElement(children, props)
      ) : (
        <p {...props}>{children}</p>
      ),
  },
}));

vi.mock('@/lib/analytics', () => ({ track: hoisted.track }));

vi.mock('./StaticListenInterface', () => ({
  StaticListenInterface: (props: Record<string, unknown>) => {
    hoisted.listen(props);
    return <p>Listen options</p>;
  },
}));

const ARTIST = { handle: 'tim', name: 'Tim White' } as Artist;

describe('ListenDrawer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tracks the open and passes the artist services to the listen view', async () => {
    const { container } = render(
      <ListenDrawer
        open
        onOpenChange={vi.fn()}
        artist={ARTIST}
        dsps={[]}
        enableDynamicEngagement
      />
    );

    expect(screen.getAllByText('Listen everywhere').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Stream Tim White on your favorite platform.').length
    ).toBeGreaterThan(0);
    expect(hoisted.track).toHaveBeenCalledWith('listen_drawer_open', {
      handle: 'tim',
    });
    expect(hoisted.listen).toHaveBeenCalledWith(
      expect.objectContaining({
        handle: 'tim',
        dspsOverride: [],
        enableDynamicEngagement: true,
      })
    );
    await expectNoA11yViolations(container);
  });

  it('reports a dismiss without touching browser history', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const back = vi
      .spyOn(globalThis.history, 'back')
      .mockImplementation(() => undefined);
    render(
      <ListenDrawer
        open
        onOpenChange={onOpenChange}
        artist={ARTIST}
        dsps={[]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Close drawer' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('does not track while closed', async () => {
    const { container } = render(
      <ListenDrawer
        open={false}
        onOpenChange={vi.fn()}
        artist={ARTIST}
        dsps={[]}
      />
    );

    expect(hoisted.track).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('keeps a long and an Arabic artist name axe-clean', async () => {
    const longName =
      'Tim White and the Late Night Los Angeles Orchestra featuring Everyone';
    const { container, rerender } = render(
      <ListenDrawer
        open
        onOpenChange={vi.fn()}
        artist={{ ...ARTIST, name: longName }}
        dsps={[]}
      />
    );
    expect(
      screen.getAllByText(`Stream ${longName} on your favorite platform.`)
        .length
    ).toBeGreaterThan(0);
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl' lang='ar'>
        <ListenDrawer
          open
          onOpenChange={vi.fn()}
          artist={{ ...ARTIST, name: 'تيم وايت' }}
          dsps={[]}
        />
      </div>
    );
    expect(
      screen.getAllByText('Stream تيم وايت on your favorite platform.').length
    ).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
