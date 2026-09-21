import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_LOCK_ATTR } from '@/lib/a11y/overlay-interaction-lock';
import { OverlayInteractionGuard } from './OverlayInteractionGuard';

afterEach(() => {
  cleanup();
  document.body.style.removeProperty('pointer-events');
  document.documentElement.removeAttribute(OVERLAY_LOCK_ATTR);
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-desktop-runtime');
});

function expectWorkspaceInteractive(step: string) {
  const main = screen.getByTestId('workspace-main');
  const composer = screen.getByLabelText('Chat Message Input');
  expect(
    main.closest('[inert]'),
    `${step}: main has an inert ancestor`
  ).toBeNull();
  expect(main.inert, `${step}: main is inert`).toBeFalsy();
  expect(
    document.body.style.pointerEvents,
    `${step}: body pointer-events is locked`
  ).not.toBe('none');
  expect(composer).not.toHaveAttribute('disabled');
}

async function expectComposerTypes(step: string) {
  const user = userEvent.setup({ delay: null });
  const composer = screen.getByLabelText('Chat Message Input');
  await user.click(composer);
  await user.clear(composer);
  const marker = `probe ${step}`;
  await user.type(composer, marker);
  expect(composer).toHaveValue(marker);
}

function WorkspaceFixture({
  dialogOpen = false,
  onAttach = () => {},
  onSend = () => {},
}: {
  readonly dialogOpen?: boolean;
  readonly onAttach?: () => void;
  readonly onSend?: () => void;
}) {
  return (
    <div data-app-shell-frame='true'>
      <div data-app-shell-sidebar-mount='true'>
        <button type='button'>Library</button>
      </div>
      <div
        id='main-content'
        data-app-shell-main-content='true'
        data-testid='workspace-main'
      >
        <textarea aria-label='Chat Message Input' />
        <button
          type='button'
          aria-label='Attachment options'
          onClick={onAttach}
        >
          Attach
        </button>
        <button type='button' onClick={onSend}>
          Send
        </button>
        {dialogOpen ? (
          <div role='dialog' aria-modal='true' aria-label='Confirm'>
            <button type='button'>Close dialog</button>
          </div>
        ) : null}
      </div>
      <OverlayInteractionGuard />
    </div>
  );
}

function InteractiveWorkspace() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [attached, setAttached] = useState(false);
  const [selected, setSelected] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <div data-app-shell-frame='true'>
      <div data-app-shell-sidebar-mount='true'>
        <button type='button' onClick={() => setRailOpen(open => !open)}>
          Toggle rail
        </button>
      </div>
      <div
        id='main-content'
        data-app-shell-main-content='true'
        data-testid='workspace-main'
      >
        <button type='button' onClick={() => setSelected(true)}>
          Select row
        </button>
        <textarea aria-label='Chat Message Input' />
        <button
          type='button'
          aria-label='Attachment options'
          onClick={() => setAttached(true)}
        >
          Attach
        </button>
        <button type='button' onClick={() => setSent(true)}>
          Send
        </button>
        <button type='button' onClick={() => setMenuOpen(true)}>
          Open menu
        </button>
        {menuOpen ? (
          <div role='menu' data-state='open'>
            <button
              type='button'
              role='menuitem'
              onClick={() => {
                setMenuOpen(false);
                setDialogOpen(true);
              }}
            >
              Open dialog
            </button>
          </div>
        ) : null}
        {dialogOpen ? (
          <div role='dialog' aria-modal='true' aria-label='Confirm'>
            <button type='button' onClick={() => setDialogOpen(false)}>
              Close dialog
            </button>
          </div>
        ) : null}
        <aside data-testid='app-shell-right-rail'>
          <aside
            aria-label='Context'
            inert={railOpen ? undefined : true}
            aria-hidden={railOpen ? 'false' : 'true'}
          >
            Rail
          </aside>
        </aside>
        {attached ? <span>attachment-open</span> : null}
        {selected ? <span>row-selected</span> : null}
        {sent ? <span>message-sent</span> : null}
      </div>
      <OverlayInteractionGuard />
    </div>
  );
}

describe('OverlayInteractionGuard', () => {
  it('restores typing, attachment opening, and send after a leaked body lock', async () => {
    const user = userEvent.setup({ delay: null });
    const onAttach = vi.fn();
    const onSend = vi.fn();
    document.body.style.pointerEvents = 'none';

    render(<WorkspaceFixture onAttach={onAttach} onSend={onSend} />);

    await waitFor(() => {
      expect(document.body.style.pointerEvents).not.toBe('none');
    });
    expectWorkspaceInteractive('after leaked body lock');
    await expectComposerTypes('after leaked body lock');
    await user.click(
      screen.getByRole('button', { name: 'Attachment options' })
    );
    expect(onAttach).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('menu → dialog → close restores row selection and composer interaction', async () => {
    const user = userEvent.setup({ delay: null });
    render(<InteractiveWorkspace />);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Open dialog' }));
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute(
        OVERLAY_LOCK_ATTR,
        'dialog'
      );
    });

    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Confirm' })
      ).not.toBeInTheDocument();
    });
    // Stacked Radix teardown race: the dialog is gone but the body lock remains.
    document.body.style.pointerEvents = 'none';
    await waitFor(() => {
      expect(document.body.style.pointerEvents).not.toBe('none');
    });

    expectWorkspaceInteractive('after menu→dialog→close');
    await user.click(screen.getByRole('button', { name: 'Select row' }));
    expect(screen.getByText('row-selected')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Attachment options' })
    );
    expect(screen.getByText('attachment-open')).toBeInTheDocument();
    await expectComposerTypes('after menu→dialog→close');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByText('message-sent')).toBeInTheDocument();
  });

  it('rail open/close keeps main content interactive', async () => {
    const user = userEvent.setup({ delay: null });
    render(<InteractiveWorkspace />);

    await user.click(screen.getByRole('button', { name: 'Toggle rail' }));
    expectWorkspaceInteractive('rail open');
    await expectComposerTypes('rail open');

    await user.click(screen.getByRole('button', { name: 'Toggle rail' }));
    const drawer = screen.getByLabelText('Context');
    expect(drawer).toHaveAttribute('inert');
    expectWorkspaceInteractive('rail closed');
    await user.click(screen.getByRole('button', { name: 'Select row' }));
    expect(screen.getByText('row-selected')).toBeInTheDocument();
  });

  it('route change restores leftover locks on the next workspace', async () => {
    document.body.style.pointerEvents = 'none';
    const { rerender } = render(<WorkspaceFixture dialogOpen />);
    expect(document.documentElement).toHaveAttribute(
      OVERLAY_LOCK_ATTR,
      'dialog'
    );

    rerender(<WorkspaceFixture />);
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Confirm' })
      ).not.toBeInTheDocument();
      expect(document.body.style.pointerEvents).not.toBe('none');
    });
    expectWorkspaceInteractive('after route change');
    await expectComposerTypes('after route change');
  });

  it('Escape restores a leftover lock when no overlay remains', async () => {
    render(<WorkspaceFixture />);
    const main = screen.getByTestId('workspace-main');
    main.inert = true;
    main.setAttribute('inert', '');
    document.body.style.pointerEvents = 'none';

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(document.body.style.pointerEvents).not.toBe('none');
      expect(main.inert).toBe(false);
    });
    expectWorkspaceInteractive('escape recovery');
    await expectComposerTypes('escape recovery');
  });

  it('restores composer focus after dismissing a dialog', async () => {
    const user = userEvent.setup({ delay: null });
    render(<InteractiveWorkspace />);
    const composer = screen.getByLabelText('Chat Message Input');
    await user.click(composer);
    expect(composer).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Open dialog' }));
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Confirm' })
      ).not.toBeInTheDocument();
    });

    await user.click(composer);
    expect(composer).toHaveFocus();
    await expectComposerTypes('focus restored');
  });

  it('preserves genuine modal isolation until the dialog is dismissed', async () => {
    document.body.style.pointerEvents = 'none';
    render(<WorkspaceFixture dialogOpen />);

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute(
        OVERLAY_LOCK_ATTR,
        'dialog'
      );
    });
    expect(document.body.style.pointerEvents).toBe('none');
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('repeated menu/dialog/rail transitions do not re-lock the workspace', async () => {
    const user = userEvent.setup({ delay: null });
    render(<InteractiveWorkspace />);

    for (const cycle of ['first', 'second', 'third']) {
      await user.click(screen.getByRole('button', { name: 'Open menu' }));
      await user.click(screen.getByRole('menuitem', { name: 'Open dialog' }));
      await user.click(screen.getByRole('button', { name: 'Close dialog' }));
      document.body.style.pointerEvents = 'none';
      await waitFor(() => {
        expect(document.body.style.pointerEvents).not.toBe('none');
      });
      await user.click(screen.getByRole('button', { name: 'Toggle rail' }));
      await user.click(screen.getByRole('button', { name: 'Toggle rail' }));
      expectWorkspaceInteractive(`cycle ${cycle}`);
    }

    await expectComposerTypes('after repeated transitions');
  });

  it.each([
    ['light', false, undefined],
    ['dark', true, undefined],
    ['electron-light', false, 'electron'],
    ['electron-dark', true, 'electron'],
  ] as const)('restores interaction for %s', async (label, dark, runtime) => {
    document.documentElement.classList.toggle('dark', dark);
    if (runtime) {
      document.documentElement.dataset.desktopRuntime = runtime;
    }
    document.body.style.pointerEvents = 'none';
    render(<WorkspaceFixture />);
    await waitFor(() => {
      expect(document.body.style.pointerEvents).not.toBe('none');
    });
    expectWorkspaceInteractive(label);
    await expectComposerTypes(label);
  });
});
