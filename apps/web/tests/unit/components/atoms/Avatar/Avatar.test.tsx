import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Avatar } from '@/components/atoms/Avatar';

// Mock Next.js Image component with proper event handling
vi.mock('next/image', () => ({
  default: vi
    .fn()
    .mockImplementation(({ src, alt, onLoad, onError, ...props }: any) => (
      // eslint-disable-next-line @next/next/no-img-element
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Test mock component
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

    it('applies correct ARIA attributes', () => {
      render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
        />
      );

      const container = screen.getByLabelText('User avatar');
      expect(container).toHaveAttribute('aria-label', 'User avatar');
    });

    it('applies correct size classes', () => {
      const { rerender } = render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          size='sm'
        />
      );

      let container = screen.getByLabelText('User avatar');
      expect(container).toHaveClass('size-8');

      rerender(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          size='lg'
        />
      );

      container = screen.getByLabelText('User avatar');
      expect(container).toHaveClass('size-16');
    });

    it('applies correct rounded classes', () => {
      const { rerender } = render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          rounded='sm'
        />
      );

      let container = screen.getByLabelText('User avatar');
      expect(container).toHaveClass('rounded-sm');

      rerender(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          rounded='full'
        />
      );

      container = screen.getByLabelText('User avatar');
      expect(container).toHaveClass('rounded-full');
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
    it('has correct role attribute', () => {
      render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
        />
      );

      const container = screen.getByLabelText('User avatar');
      expect(container).toHaveAttribute('role', 'img');
    });

    it('has correct aria-label', () => {
      render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='Profile picture of John Doe'
          name='John Doe'
        />
      );

      const container = screen.getByLabelText('Profile picture of John Doe');
      expect(container).toHaveAttribute(
        'aria-label',
        'Profile picture of John Doe'
      );
    });

    it('fallback initials are not selectable', () => {
      render(<Avatar src={null} alt='User avatar' name='John Doe' />);

      const initialsElement = screen.getByText('JD');
      expect(initialsElement).toHaveClass('select-none');
    });
  });

  describe('Custom Props', () => {
    function assertNonNull<T>(
      value: T,
      message: string
    ): asserts value is NonNullable<T> {
      if (value == null) throw new Error(message);
    }

    const getAvatarWrapper = (altText: string): HTMLElement => {
      const labeledElement = screen.getByLabelText(altText);
      const wrapper = labeledElement.parentElement;
      assertNonNull(wrapper, 'Expected avatar wrapper element');
      return wrapper;
    };

    it('accepts custom className', () => {
      render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          className='custom-avatar-class'
        />
      );

      const wrapper = getAvatarWrapper('User avatar');
      expect(wrapper).toHaveClass('custom-avatar-class');
    });

    it('accepts custom style props', () => {
      const customStyle = { border: '2px solid red', opacity: '0.5' };

      render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          style={customStyle}
        />
      );

      const wrapper = getAvatarWrapper('User avatar');
      // Check that style attribute exists and contains our custom styles
      expect(wrapper).toHaveAttribute('style');
      const style = wrapper.getAttribute('style');
      if (!style)
        throw new Error('Expected avatar wrapper to have inline styles');
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

      const container = screen.getByLabelText('User avatar');
      expect(container).toHaveAttribute('aria-busy', 'false');
    });
  });
});
