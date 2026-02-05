import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Avatar } from '@/components/molecules/Avatar';

vi.mock('next/image', () => ({
  default: vi.fn().mockImplementation(
    ({
      src,
      alt,
      // Filter out Next.js Image-specific props that shouldn't be on DOM elements
      priority: _priority,
      blurDataURL: _blurDataURL,
      placeholder: _placeholder,
      quality: _quality,
      sizes: _sizes,
      ...props
    }: any) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} {...props} />
    )
  ),
}));

describe('Avatar (legacy ArtistAvatar coverage)', () => {
  it('renders with required props', () => {
    render(
      <Avatar
        src='test-image.jpg'
        alt='Test Artist'
        name='Test Artist'
        size='lg'
      />
    );

    const avatarContainer = screen.getByLabelText('Test Artist');
    expect(avatarContainer).toBeInTheDocument();
  });

  it('applies aria label and fallback initials when src is missing', () => {
    render(
      <Avatar
        src={null}
        alt='Test Artist Avatar'
        name='Test Artist'
        size='display-sm'
      />
    );

    const avatarContainer = screen.getByLabelText('Test Artist Avatar');
    expect(avatarContainer).toBeInTheDocument();
    expect(screen.getByText('TA')).toBeInTheDocument();
  });
});
