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
    }: any) => <img src={src} alt={alt} {...props} />
  ),
}));

describe('Avatar (legacy ArtistAvatar coverage)', () => {
  it('renders with required props', () => {
    const { container } = render(
      <Avatar
        src='test-image.jpg'
        alt='Test Artist'
        name='Test Artist'
        size='lg'
      />
    );

    const avatarContainer = container.querySelector('.relative');
    expect(avatarContainer).toBeInTheDocument();
  });

  it('shows fallback initials when src is missing', () => {
    render(
      <Avatar
        src={null}
        alt='Test Artist Avatar'
        name='Test Artist'
        size='display-sm'
      />
    );

    expect(screen.getByText('TA')).toBeInTheDocument();
  });
});
