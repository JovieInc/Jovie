import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { ArtistInfo } from './ArtistInfo';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    readonly children: ReactNode;
    readonly href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/molecules/Avatar', () => ({
  Avatar: ({ alt, size }: { readonly alt: string; readonly size: string }) => (
    <span role='img' aria-label={alt} data-size={size} />
  ),
}));

vi.mock('@/features/profile/ProfilePhotoContextMenu', () => ({
  ProfilePhotoContextMenu: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const artist = {
  id: 'artist-1',
  handle: 'jordan-lee',
  name: 'Jordan Lee',
  image_url: 'https://example.com/jordan.jpg',
  tagline: 'Independent artist',
  is_verified: true,
} as unknown as Artist;

describe('ArtistInfo certificate', () => {
  it('links the avatar and name to the profile and stays keyboard reachable', async () => {
    const user = userEvent.setup();
    const { container } = render(<ArtistInfo artist={artist} />);

    const avatarLink = screen.getByRole('link', {
      name: "Go to Jordan Lee's profile",
    });
    expect(avatarLink).toHaveAttribute('href', '/jordan-lee');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Jordan Lee'
    );
    expect(screen.getByText('Independent artist')).toHaveAttribute(
      'itemprop',
      'description'
    );

    await user.tab();
    expect(avatarLink).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('falls back to the default tagline for a partial profile', async () => {
    const { container } = render(
      <ArtistInfo
        artist={{
          ...artist,
          image_url: undefined,
          tagline: undefined,
          is_verified: false,
        }}
        linkToProfile={false}
      />
    );

    expect(screen.getByText('Artist')).toHaveClass('text-tertiary-token');
    expect(
      screen.queryByRole('link', { name: "Go to Jordan Lee's profile" })
    ).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders the split layout with trailing content in RTL', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistInfo
          artist={{
            ...artist,
            name: 'فيروز',
            handle: 'fairuz',
            tagline: 'مغنية لبنانية',
          }}
          bodyLayout='split'
          subtitle='مغنية لبنانية وأيقونة الموسيقى العربية.'
          trailingContent={<button type='button'>متابعة</button>}
        />
      </div>
    );

    expect(
      screen.getByText('مغنية لبنانية وأيقونة الموسيقى العربية.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'متابعة' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: "Go to فيروز's profile" })
    ).toHaveAttribute('href', '/fairuz');
    await expectNoA11yViolations(container);
  });
});
