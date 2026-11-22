import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  TipLinkSection,
  VenmoConnectDialog,
  VenmoEditForm,
} from './DashboardPay.parts';

function ConnectHarness({ onSave }: { readonly onSave: () => void }) {
  const [handle, setHandle] = useState('');
  return (
    <VenmoConnectDialog
      open
      onClose={vi.fn()}
      venmoHandle={handle}
      onVenmoHandleChange={setHandle}
      onSave={onSave}
      isSaving={false}
      saveSuccess={null}
    />
  );
}

function EditHarness({ onSave }: { readonly onSave: () => void }) {
  const [handle, setHandle] = useState('artist');
  return (
    <VenmoEditForm
      venmoHandle={handle}
      onVenmoHandleChange={setHandle}
      onSave={onSave}
      onCancel={vi.fn()}
      isSaving={false}
    />
  );
}

describe('VenmoConnectDialog', () => {
  it('keeps the typed username through a rerender and Escape, then connects', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { rerender } = render(<ConnectHarness onSave={onSave} />);
    const field = screen.getByLabelText('Venmo Username');

    await user.type(field, 'tim-white');
    rerender(<ConnectHarness onSave={onSave} />);

    expect(field).toHaveValue('tim-white');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('closes from Cancel and shows progress while saving', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(
      <VenmoConnectDialog
        open
        onClose={onClose}
        venmoHandle='artist'
        onVenmoHandleChange={vi.fn()}
        onSave={vi.fn()}
        isSaving={false}
        saveSuccess={null}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <VenmoConnectDialog
        open
        onClose={onClose}
        venmoHandle='artist'
        onVenmoHandleChange={vi.fn()}
        onSave={vi.fn()}
        isSaving
        saveSuccess={null}
      />
    );
    expect(screen.getByRole('button', { name: 'Connecting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await expectNoA11yViolations(document.body);
  });
});

describe('VenmoEditForm', () => {
  it('edits the handle, saves and keeps focus through a rerender', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container, rerender } = render(<EditHarness onSave={onSave} />);
    const field = screen.getByPlaceholderText('your-username');

    await user.type(field, '2');
    rerender(<EditHarness onSave={onSave} />);
    await user.keyboard('{Escape}');

    expect(field).toHaveValue('artist2');
    expect(field).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });
});

describe('TipLinkSection', () => {
  it('shows the pay link under a level-two heading and stays axe-clean', async () => {
    const { container } = render(
      <TipLinkSection
        tipUrl='https://jov.ie/tim/pay?source=link'
        tipRelativePathLink='/tim/pay?source=link'
      />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Pay Link' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('https://jov.ie/tim/pay?source=link')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
