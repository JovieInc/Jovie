import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerHeaderActions } from './DrawerHeaderActions';

describe('DrawerHeaderActions states', () => {
  it('routes primary actions and the overflow menu', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onCopyTitle = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <DrawerHeaderActions
        primaryActions={[
          {
            id: 'open',
            label: 'Open entity',
            icon: ExternalLink,
            onClick: onOpen,
          },
          {
            id: 'copy',
            label: 'Copy link',
            icon: Copy,
            activeIcon: Check,
            isActive: true,
            onClick: vi.fn(),
          },
          { id: 'third', label: 'Hidden third', icon: Copy },
        ]}
        overflowActions={[
          {
            id: 'copy-title',
            label: 'Copy title',
            icon: Copy,
            onClick: onCopyTitle,
          },
        ]}
        onClose={onClose}
      />
    );

    // At most two primary actions render inline.
    expect(screen.queryByRole('button', { name: 'Hidden third' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy link' })).toHaveAttribute(
      'data-active',
      'true'
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Open entity' }));
    expect(onOpen).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(
      await screen.findByRole('menuitem', { name: /Copy title/ })
    );
    expect(onCopyTitle).toHaveBeenCalledOnce();

    await user.click(screen.getByTestId('drawer-header-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows only Close when there are no actions', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <DrawerHeaderActions primaryActions={[]} onClose={onClose} />
    );

    expect(screen.getByRole('button', { name: 'More actions' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('renders nothing actionable without actions or Close', async () => {
    const { container } = render(<DrawerHeaderActions primaryActions={[]} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('renders a single primary action without overflow', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const { container } = render(
      <DrawerHeaderActions
        primaryActions={[
          { id: 'copy', label: 'Copy link', icon: Copy, onClick: onCopy },
        ]}
      />
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(onCopy).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('keeps long labels as accessible names and menu items', async () => {
    const user = userEvent.setup();
    const label = 'Copy the smart link for every streaming service';
    const { container } = render(
      <DrawerHeaderActions
        primaryActions={[
          {
            id: 'open',
            label: 'Open Midnight Drive (Extended Club Mix) in a new tab',
            icon: ExternalLink,
            onClick: vi.fn(),
          },
        ]}
        overflowActions={[{ id: 'copy', label, icon: Copy, onClick: vi.fn() }]}
      />
    );

    expect(
      screen.getByRole('button', {
        name: 'Open Midnight Drive (Extended Club Mix) in a new tab',
      })
    ).toBeVisible();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(
      await screen.findByRole('menuitem', { name: new RegExp(label) })
    ).toBeInTheDocument();
  });

  it('routes actions in a right-to-left drawer', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DrawerHeaderActions
          primaryActions={[
            {
              id: 'open',
              label: 'فتح العنصر',
              icon: ExternalLink,
              onClick: onOpen,
            },
          ]}
          onClose={vi.fn()}
        />
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'فتح العنصر' }));
    expect(onOpen).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});
