import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type ArtistAvatarItem, ArtistAvatarStack } from './ArtistAvatarStack';

// Render next/image as a plain img so avatar role queries work in JSDOM
vi.mock('next/image', () => ({
  default: vi
    .fn()
    .mockImplementation(
      ({
        src,
        alt,
        priority: _p,
        blurDataURL: _b,
        placeholder: _ph,
        quality: _q,
        sizes: _s,
        unoptimized: _u,
        ...rest
      }: Record<string, unknown>) => (
        <img src={src as string} alt={alt as string} {...rest} />
      )
    ),
}));

const url = (n: string) => `https://example.com/${n}.jpg`;

const ONE: ArtistAvatarItem[] = [
  { id: 'a1', displayName: 'Tim White', avatarUrl: url('tim') },
];

const TWO: ArtistAvatarItem[] = [
  { id: 'a1', displayName: 'Tim White', avatarUrl: url('tim') },
  { id: 'a2', displayName: 'Jane Doe', avatarUrl: url('jane') },
];

const FOUR: ArtistAvatarItem[] = [
  { id: 'a1', displayName: 'Tim White', avatarUrl: url('tim') },
  { id: 'a2', displayName: 'Jane Doe', avatarUrl: url('jane') },
  { id: 'a3', displayName: 'Bob Smith', avatarUrl: url('bob') },
  { id: 'a4', displayName: 'Alice Lee', avatarUrl: url('alice') },
];

describe('ArtistAvatarStack', () => {
  it('returns null for an empty artist list', () => {
    const { container } = render(<ArtistAvatarStack artists={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('1 artist — no overflow label', () => {
    render(<ArtistAvatarStack artists={ONE} />);
    expect(screen.queryByText(/artists/)).not.toBeInTheDocument();
  });

  it('2 artists — no overflow label', () => {
    render(<ArtistAvatarStack artists={TWO} />);
    expect(screen.queryByText(/artists/)).not.toBeInTheDocument();
  });

  it('3+ artists — shows overflow count and caps visible avatars at two', () => {
    render(<ArtistAvatarStack artists={FOUR} />);
    expect(screen.getByText(/\+2 artists/)).toBeInTheDocument();
    // Third and fourth artists must NOT appear as visible alt text or labels
    expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
    expect(screen.queryByText('Alice Lee')).not.toBeInTheDocument();
  });

  it('has an accessible group label listing all artist names', () => {
    render(<ArtistAvatarStack artists={TWO} />);
    expect(screen.getByLabelText('Tim White, Jane Doe')).toBeInTheDocument();
  });

  it('accessible label includes all names even when overflow', () => {
    render(<ArtistAvatarStack artists={FOUR} />);
    expect(
      screen.getByLabelText('Tim White, Jane Doe, Bob Smith, Alice Lee')
    ).toBeInTheDocument();
  });

  it('overflow count is aria-hidden so screen readers rely on the group label', () => {
    render(<ArtistAvatarStack artists={FOUR} />);
    const overflowSpan = screen.getByText(/\+2 artists/);
    expect(overflowSpan).toHaveAttribute('aria-hidden', 'true');
  });
});
