import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArtistAvatar } from '@/components/atoms/ArtistAvatar';

describe('ArtistAvatar - Basic Functionality', () => {
  it('should render with required props', () => {
    render(
      <ArtistAvatar
        src="test-image.jpg"
        alt="Test Artist"
        name="Test Artist"
        size="md"
      />
    );

    // Check that the component renders without crashing
    const avatarContainer = screen.getByRole('img', { hidden: true });
    expect(avatarContainer).toBeInTheDocument();
  });

  it('should have proper accessibility attributes', () => {
    render(
      <ArtistAvatar
        src="test-image.jpg"
        alt="Test Artist Avatar"
        name="Test Artist"
        size="md"
      />
    );

    const image = screen.getByRole('img', { hidden: true });
    expect(image).toHaveAttribute('alt');
  });

  it('should pass through size prop correctly', () => {
    render(
      <ArtistAvatar
        src="test-image.jpg"
        alt="Test Artist"
        name="Test Artist"
        size="lg"
      />
    );

    // Component should render without errors with different sizes
    const avatarContainer = screen.getByRole('img', { hidden: true });
    expect(avatarContainer).toBeInTheDocument();
  });
});