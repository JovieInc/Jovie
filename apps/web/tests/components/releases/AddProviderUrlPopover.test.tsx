import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AddProviderUrlPopover } from '@/features/dashboard/organisms/releases/components/AddProviderUrlPopover';

vi.mock('@jovie/ui', () => ({
  Input: ({
    value,
    onChange,
    inputSize: _inputSize,
    ...props
  }: {
    value?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    inputSize?: string;
    [key: string]: unknown;
  }) => <input value={value} onChange={onChange} {...props} />,
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerButton: ({
    children,
    onClick,
    type = 'button',
    ...props
  }: {
    children: ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit';
    [key: string]: unknown;
  }) => (
    <button type={type} onClick={onClick} {...props}>
      {children}
    </button>
  ),
  DrawerFormField: ({
    children,
    helperText,
  }: {
    children: ReactNode;
    helperText?: ReactNode;
  }) => (
    <div>
      {children}
      {helperText}
    </div>
  ),
  DrawerSurfaceCard: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe('AddProviderUrlPopover', () => {
  it('rejects an invalid provider domain and does not save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <AddProviderUrlPopover
        providerLabel='Spotify'
        accent='#1DB954'
        providerKey='spotify'
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add Spotify link' }));
    await user.type(
      screen.getByPlaceholderText('Paste URL here...'),
      'https://example.com/not-spotify'
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      screen.getByText(
        /URL must be from one of: open\.spotify\.com, spotify\.com, spotify\.link/i
      )
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves a valid provider url', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <AddProviderUrlPopover
        providerLabel='Spotify'
        accent='#1DB954'
        providerKey='spotify'
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add Spotify link' }));
    await user.type(
      screen.getByPlaceholderText('Paste URL here...'),
      'https://open.spotify.com/album/123'
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('https://open.spotify.com/album/123');
    });
  });
});
