import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cloneElement, isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayDrawer } from '@/components/features/profile/PayDrawer';
import { ContactDrawer } from '@/features/profile/artist-contacts-button/ContactDrawer';
import { ListenDrawer } from '@/features/profile/ListenDrawer';

vi.mock('vaul', () => ({
  Drawer: {
    Root: ({
      onOpenChange,
      children,
    }: {
      onOpenChange: (isOpen: boolean) => void;
      children: React.ReactNode;
    }) => (
      <div>
        <button type='button' onClick={() => onOpenChange(false)}>
          mock-dismiss
        </button>
        {children}
      </div>
    ),
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

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/features/profile/StaticListenInterface', () => ({
  StaticListenInterface: () => <div>listen ui</div>,
}));

describe('profile drawers dismiss behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not navigate browser history when tip drawer dismisses', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ available: false }),
    });
    globalThis.fetch = fetchMock;
    const historyBackSpy = vi
      .spyOn(globalThis.history, 'back')
      .mockImplementation(() => undefined);

    render(
      <PayDrawer
        open
        onOpenChange={onOpenChange}
        artistName='A'
        artistHandle='artist'
        venmoLink='https://venmo.com/artist'
      />
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tips/create-checkout?handle=artist',
        expect.objectContaining({ cache: 'no-store' })
      )
    );

    await user.click(screen.getByRole('button', { name: 'mock-dismiss' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(historyBackSpy).not.toHaveBeenCalled();
  });

  it('does not navigate browser history when listen drawer dismisses', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const historyBackSpy = vi
      .spyOn(globalThis.history, 'back')
      .mockImplementation(() => undefined);

    render(
      <ListenDrawer
        open
        onOpenChange={onOpenChange}
        artist={{ handle: 'artist' } as never}
        dsps={[]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'mock-dismiss' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(historyBackSpy).not.toHaveBeenCalled();
  });

  it('does not navigate browser history when contact drawer dismisses', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const historyBackSpy = vi
      .spyOn(globalThis.history, 'back')
      .mockImplementation(() => undefined);

    render(
      <ContactDrawer
        open
        onOpenChange={onOpenChange}
        artistName='A'
        artistHandle='artist'
        contacts={[]}
        primaryChannel={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'mock-dismiss' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(historyBackSpy).not.toHaveBeenCalled();
  });
});
