import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileMediaCard } from './ProfileMediaCard';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    readonly children: ReactNode;
    readonly href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({
    alt,
    src,
  }: {
    readonly alt: string;
    readonly src?: string | null;
  }) => <img alt={alt} src={src ?? undefined} />,
}));

describe('ProfileMediaCard', () => {
  it('renders bounded media copy and action affordances', () => {
    render(
      <ProfileMediaCard
        eyebrow='New release'
        title='The Deep End'
        subtitle='Release plan, profile, and fan alert are ready.'
        imageAlt='The Deep End artwork'
        ratio='portrait'
        action={{
          label: 'Listen now',
          href: '/timwhite/the-deep-end',
          icon: 'Play',
        }}
        dataTestId='profile-media-card'
      />
    );

    expect(screen.getByTestId('profile-media-card')).toBeInTheDocument();
    expect(screen.getByTestId('profile-media-card-title')).toHaveClass(
      'line-clamp-2'
    );
    expect(
      screen.getByText('Release plan, profile, and fan alert are ready.')
    ).toHaveClass('line-clamp-2');
    expect(screen.getByRole('link', { name: 'Listen now' })).toHaveAttribute(
      'href',
      '/timwhite/the-deep-end'
    );
  });
});
