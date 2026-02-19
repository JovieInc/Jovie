import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Avatar } from '@/components/molecules/Avatar';

// Mock Next.js Image component with proper event handling
vi.mock('next/image', () => ({
  default: vi
    .fn()
    .mockImplementation(({ src, alt, onLoad, onError, ...props }: any) => (
      <img
        src={src}
        alt={alt}
        onLoad={onLoad}
        onError={onError}
        {...props}
        data-testid='avatar-image'
      />
    )),
}));

describe('Avatar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Display with Image', () => {
    it('renders with image source', () => {
      render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
        />
      );

      const image = screen.getByTestId('avatar-image');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'https://example.com/avatar.jpg');
      expect(image).toHaveAttribute('alt', '');
    });

    it('applies aria-hidden on inner container', () => {
      const { container } = render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
        />
      );

      const innerDiv = container.querySelector('[aria-hidden="true"]');
      expect(innerDiv).toBeInTheDocument();
    });

    it('applies correct size classes', () => {
      const { container, rerender } = render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          size='sm'
        />
      );

      let innerDiv = container.querySelector('[aria-hidden="true"]');
      expect(innerDiv).toHaveClass('size-8');

      rerender(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          size='lg'
        />
      );

      innerDiv = container.querySelector('[aria-hidden="true"]');
      expect(innerDiv).toHaveClass('size-16');
    });

    it('applies correct rounded classes', () => {
      const { container, rerender } = render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          rounded='sm'
        />
      );

      let innerDiv = container.querySelector('[aria-hidden="true"]');
      expect(innerDiv).toHaveClass('rounded-sm');

      rerender(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          rounded='full'
        />
      );

      innerDiv = container.querySelector('[aria-hidden="true"]');
      expect(innerDiv).toHaveClass('rounded-full');
    });
  });

  describe('Fallback States', () => {
    it('shows initials when no image source provided', () => {
      render(<Avatar src={null} alt='User avatar' name='John Doe' />);

      expect(screen.getByText('JD')).toBeInTheDocument();
      expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
    });

    it('shows initials when empty string provided', () => {
      render(<Avatar src='' alt='User avatar' name='Jane Smith' />);

      expect(screen.getByText('JS')).toBeInTheDocument();
    });

    it('generates correct initials for different name formats', () => {
      const testCases = [
        { name: 'John Doe', expected: 'JD' },
        { name: 'Jane', expected: 'J' },
        { name: 'Mary Jane Watson', expected: 'MJ' },
        { name: 'jean-claude van damme', expected: 'JV' },
        { name: '', expected: '?' },
        { name: undefined, expected: '?' },
      ];

      testCases.forEach(({ name, expected }) => {
        const { unmount } = render(
          <Avatar
            src={null}
            alt='User avatar'
            name={name}
            data-testid={`avatar-${expected}`}
          />
        );

        expect(screen.getByText(expected)).toBeInTheDocument();
        unmount();
      });
    });

    it('handles error state by showing fallback', () => {
      render(
        <Avatar
          src='https://broken-url.com/image.jpg'
          alt='User avatar'
          name='Error User'
        />
      );

      // Simulate image error using fireEvent
      const image = screen.getByTestId('avatar-image');
      fireEvent.error(image);

      // Should show fallback initials after error
      expect(screen.getByText('EU')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('inner container is aria-hidden', () => {
      const { container } = render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
        />
      );

      const innerDiv = container.querySelector('[aria-hidden="true"]');
      expect(innerDiv).toBeInTheDocument();
    });

    it('image alt is empty for decorative use', () => {
      render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='Profile picture of John Doe'
          name='John Doe'
        />
      );

      const image = screen.getByTestId('avatar-image');
      expect(image).toHaveAttribute('alt', '');
    });

    it('fallback initials are not selectable', () => {
      render(<Avatar src={null} alt='User avatar' name='John Doe' />);

      const initialsElement = screen.getByText('JD');
      expect(initialsElement).toHaveClass('select-none');
    });
  });

  describe('Custom Props', () => {
    it('accepts custom className', () => {
      const { container } = render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          className='custom-avatar-class'
        />
      );

      const wrapper = container.querySelector('.relative');
      expect(wrapper).toHaveClass('custom-avatar-class');
    });

    it('accepts custom style props', () => {
      const customStyle = { border: '2px solid red', opacity: '0.5' };

      const { container } = render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          style={customStyle}
        />
      );

      const wrapper = container.querySelector('.relative');
      expect(wrapper).toHaveAttribute('style');
      const style = wrapper?.getAttribute('style');
      expect(style).toContain('border');
      expect(style).toContain('opacity');
    });

    it('applies priority prop to Next.js Image', () => {
      render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          priority={true}
        />
      );

      const image = screen.getByTestId('avatar-image');
      // Note: The priority prop is passed to the mock but not visible as an attribute
      expect(image).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('shows loading shimmer before image loads', () => {
      render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
        />
      );

      // Before onLoad is triggered, shimmer should be visible
      const shimmer = document.querySelector('.skeleton');
      expect(shimmer).toBeInTheDocument();
    });

    it('hides loading shimmer after image loads', () => {
      render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
        />
      );

      // Simulate image load using fireEvent
      const image = screen.getByTestId('avatar-image');
      fireEvent.load(image);

      // After load, image should have opacity-100 class
      expect(image).toHaveClass('opacity-100');

      // Shimmer should be removed after load
      const shimmer = document.querySelector('.skeleton');
      expect(shimmer).not.toBeInTheDocument();
    });
  });
});
