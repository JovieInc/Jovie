import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cloneElement, isValidElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PayDrawer } from './PayDrawer';

const hoisted = vi.hoisted(() => ({ track: vi.fn() }));

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

const PROPS = {
  artistName: 'Tim White',
  artistHandle: 'tim',
  venmoLink: 'https://venmo.com/timwhite',
} as const;

function stubCapability(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('PayDrawer', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('tracks the open, fires the pixel and looks up card checkout', async () => {
    const pixel = { track: vi.fn() };
    vi.stubGlobal('joviePixel', pixel);
    const fetchMock = stubCapability({ available: false });
    const { container } = render(
      <PayDrawer open onOpenChange={vi.fn()} {...PROPS} />
    );

    expect(screen.getAllByText('Pay Tim White').length).toBeGreaterThan(0);
    expect(hoisted.track).toHaveBeenCalledWith('tip_drawer_open', {
      handle: 'tim',
    });
    expect(pixel.track).toHaveBeenCalledWith('tip_page_view');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tips/create-checkout?handle=tim',
        expect.objectContaining({ cache: 'no-store' })
      )
    );
    await expectNoA11yViolations(container);
  });

  it('offers card checkout when the artist can take it', async () => {
    stubCapability({ available: true, profileId: 'profile-1' });
    const { container } = render(
      <PayDrawer open onOpenChange={vi.fn()} {...PROPS} profileId='profile-1' />
    );

    expect(
      (await screen.findAllByText('Apple Pay / Card')).length
    ).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('falls back to Venmo only when the checkout lookup fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(
      <PayDrawer open onOpenChange={vi.fn()} {...PROPS} />
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText('Apple Pay / Card')).toBeNull();
    expect(screen.getAllByText('Venmo').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('reports a dismiss without touching browser history', async () => {
    const user = userEvent.setup();
    stubCapability({ available: false });
    const onOpenChange = vi.fn();
    const back = vi
      .spyOn(globalThis.history, 'back')
      .mockImplementation(() => undefined);
    render(<PayDrawer open onOpenChange={onOpenChange} {...PROPS} />);

    await user.click(screen.getByRole('button', { name: 'Close drawer' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('keeps a long and an Arabic artist name axe-clean', async () => {
    stubCapability({ available: false });
    const longName =
      'Tim White and the Late Night Los Angeles Orchestra featuring Everyone';
    const { container, rerender } = render(
      <PayDrawer
        open
        onOpenChange={vi.fn()}
        {...PROPS}
        artistName={longName}
        amounts={[5]}
      />
    );
    expect(screen.getAllByText(`Pay ${longName}`).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl' lang='ar'>
        <PayDrawer
          open
          onOpenChange={vi.fn()}
          {...PROPS}
          artistName='تيم وايت'
        />
      </div>
    );
    expect(screen.getAllByText('Pay تيم وايت').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
