import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AVATAR_SIZE_MAP, AVATAR_SIZE_NAMES, getInitials } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import Image from 'next/image';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Avatar } from '@/components/molecules/Avatar';

// Mock Next.js Image component with proper event handling
vi.mock('next/image', () => ({
  default: vi
    .fn()
    .mockImplementation(
      ({
        src,
        alt,
        onLoad,
        onError,
        priority: _priority,
        blurDataURL: _blurDataURL,
        unoptimized: _unoptimized,
        ...props
      }: any) => (
        <img
          src={src}
          alt={alt}
          onLoad={onLoad}
          onError={onError}
          {...props}
          data-testid='avatar-image'
        />
      )
    ),
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

    it('bypasses optimization for Vercel Blob avatars', () => {
      render(
        <Avatar
          src='https://example.public.blob.vercel-storage.com/avatars/user/avatar.avif'
          alt='User avatar'
          name='John Doe'
        />
      );

      const mockedImage = vi.mocked(Image);
      expect(mockedImage.mock.calls[0]?.[0].unoptimized).toBe(true);
    });

    it('keeps optimization enabled for normal avatar URLs', () => {
      render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
        />
      );

      const mockedImage = vi.mocked(Image);
      expect(mockedImage.mock.calls[0]?.[0].unoptimized).toBe(false);
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

    it('applies canonical size pixels from the shared contract', () => {
      const { container, rerender } = render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          size='sm'
        />
      );

      let innerDiv = container.querySelector('[aria-hidden="true"]');
      expect(innerDiv).toHaveAttribute('data-slot', 'app-avatar');
      expect(innerDiv).toHaveAttribute('data-size', 'sm');
      expect(innerDiv).toHaveAttribute('data-shape', 'person');
      expect(innerDiv).toHaveClass('rounded-full');
      expect(innerDiv).toHaveStyle({ width: '20px', height: '20px' });

      rerender(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
          size='lg'
        />
      );

      innerDiv = container.querySelector('[aria-hidden="true"]');
      expect(innerDiv).toHaveAttribute('data-size', 'lg');
      expect(innerDiv).toHaveStyle({ width: '32px', height: '32px' });
    });

    it('keeps person avatars circular and artwork rounded-square', () => {
      const { container, rerender } = render(
        <Avatar
          src='https://example.com/avatar.jpg'
          alt='User avatar'
          name='John Doe'
        />
      );

      let innerDiv = container.querySelector('[aria-hidden="true"]');
      expect(innerDiv).toHaveClass('rounded-full');
      expect(innerDiv).toHaveAttribute('data-shape', 'person');

      rerender(
        <Avatar
          src='https://example.com/release.jpg'
          alt='Release artwork'
          name='Midnight Echo'
          size='2xl'
          shape='artwork'
        />
      );

      innerDiv = container.querySelector('[aria-hidden="true"]');
      expect(innerDiv).toHaveAttribute('data-shape', 'artwork');
      expect(innerDiv).toHaveClass('rounded-lg');
      expect(innerDiv).not.toHaveClass('rounded-full');
      const artworkImage = screen.getByTestId('avatar-image');
      expect(artworkImage).toHaveClass('rounded-lg', 'object-contain');
      expect(artworkImage).not.toHaveClass('rounded-full', 'object-cover');
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
        'John Doe',
        'Jane',
        'Mary Jane Watson',
        'jean-claude van damme',
        '',
        undefined,
      ];

      testCases.forEach(name => {
        const expected = name ? getInitials(name) : '?';
        const { unmount } = render(
          <Avatar
            src={null}
            alt='User avatar'
            name={name}
            data-testid='avatar'
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

    it('keeps the app frame on the canonical size when a caller passes sizing classes', () => {
      const { container } = render(
        <Avatar
          src={null}
          alt='User avatar'
          name='Tim White'
          size='xs'
          className='size-10 h-10 w-10'
        />
      );

      const frame = container.querySelector('[data-slot="app-avatar-frame"]');
      expect(frame).toHaveAttribute('data-size', 'xs');
      expect(frame).toHaveAttribute('data-shape', 'person');
      expect(frame).toHaveClass('size-10', 'h-10', 'w-10');
      expect(frame).toHaveStyle({ width: '16px', height: '16px' });

      const avatar = container.querySelector('[data-slot="app-avatar"]');
      expect(avatar).toHaveStyle({ width: '16px', height: '16px' });
      expect(screen.getByText('TW')).toBeInTheDocument();
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

    it('does not keep a duplicated size table in the web adapter', () => {
      const adapterSource = readFileSync(
        path.resolve(process.cwd(), 'components/molecules/Avatar/Avatar.tsx'),
        'utf8'
      );
      const uploadableSource = readFileSync(
        path.resolve(
          process.cwd(),
          'components/organisms/AvatarUploadable.tsx'
        ),
        'utf8'
      );

      expect(adapterSource).not.toMatch(/const SIZE_MAP\s*=/);
      expect(adapterSource).not.toMatch(/rounded\?:/);
      expect(adapterSource).toContain('getAvatarSizePx');
      expect(uploadableSource).not.toMatch(/const SIZE_MAP\s*=/);
      expect(uploadableSource).toContain('getAvatarSizePx');

      for (const size of AVATAR_SIZE_NAMES) {
        expect(typeof AVATAR_SIZE_MAP[size].px).toBe('number');
      }
    });

    it('keeps observed identity-row callers off wrapper sizing classes', () => {
      const observedIdentitySources = [
        'components/organisms/user-button/UserButton.tsx',
        'components/organisms/ProfileSwitcher.tsx',
        'components/features/admin/admin-releases-table/AdminReleasesTableUnified.tsx',
      ] as const;

      for (const sourcePath of observedIdentitySources) {
        const source = readFileSync(path.resolve(process.cwd(), sourcePath), {
          encoding: 'utf8',
        });
        expect(source).not.toMatch(
          /<Avatar[\s\S]{0,240}className=['"][^'"]*\b(?:size|h|w)-/
        );
      }
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
