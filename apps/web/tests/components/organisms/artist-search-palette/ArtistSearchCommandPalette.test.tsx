import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ArtistSearchCommandPalette } from '@/components/organisms/artist-search-palette/ArtistSearchCommandPalette';

vi.mock('@jovie/ui', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@radix-ui/react-dialog', () => ({
  Title: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  Description: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

vi.mock('cmdk', () => {
  const CommandRoot = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );
  const Input = ({
    onValueChange,
    ...props
  }: {
    onValueChange?: (value: string) => void;
    [key: string]: unknown;
  }) => (
    <input
      {...props}
      onChange={event =>
        onValueChange?.((event.target as HTMLInputElement).value)
      }
    />
  );
  const List = ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>;
  const Empty = ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>;
  const Group = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );
  const Item = ({
    children,
    onSelect,
    className,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    className?: string;
  }) => (
    <button type='button' className={className} onClick={onSelect}>
      {children}
    </button>
  );

  return {
    Command: Object.assign(CommandRoot, {
      Input,
      List,
      Empty,
      Group,
      Item,
    }),
  };
});

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock('@/components/atoms/SocialIcon', () => ({
  SocialIcon: ({ platform }: { platform: string }) => <span>{platform}</span>,
}));

vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    error: null,
    search: vi.fn(),
    clear: vi.fn(),
  }),
  useAppleMusicArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    error: null,
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));

describe('ArtistSearchCommandPalette', () => {
  it('creates a synthetic Apple Music artist from a manual url', async () => {
    const onArtistSelect = vi.fn();
    const onOpenChange = vi.fn();
    const artistUrl = 'https://music.apple.com/us/artist/jovie-artist/12345';

    render(
      <ArtistSearchCommandPalette
        open
        onOpenChange={onOpenChange}
        provider='apple_music'
        onArtistSelect={onArtistSelect}
      />
    );

    expect(
      await screen.findByPlaceholderText('Search Apple Music artists...')
    ).toBeInTheDocument();

    const manualInput = screen.getByTestId(
      'artist-search-manual-input'
    ) as HTMLInputElement;

    fireEvent.change(manualInput, { target: { value: artistUrl } });
    await waitFor(() => {
      expect(manualInput.value).toBe(artistUrl);
    });

    const connectButton = screen.getByTestId('artist-search-manual-submit');
    await waitFor(() => {
      expect(connectButton).toBeEnabled();
    });

    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(onArtistSelect).toHaveBeenCalledWith({
        id: '12345',
        name: 'jovie artist',
        url: artistUrl,
      });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
