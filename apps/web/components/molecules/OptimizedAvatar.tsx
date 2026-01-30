'use client';

import { Avatar, type AvatarProps } from '@/components/atoms/Avatar';

interface OptimizedAvatarProps {
  readonly src: string | null | undefined;
  readonly alt: string;
  readonly size?: 64 | 128 | 256 | 384;
  readonly className?: string;
  readonly priority?: boolean;
  readonly fallbackSrc?: string;
}

const SIZE_MAP: Record<
  NonNullable<OptimizedAvatarProps['size']>,
  AvatarProps['size']
> = {
  64: 'lg',
  128: 'display-md',
  256: 'display-3xl',
  384: 'display-4xl',
};

export function OptimizedAvatar({
  src,
  alt,
  size = 64,
  className,
  priority = false,
  fallbackSrc = '/android-chrome-192x192.png',
}: OptimizedAvatarProps) {
  const avatarSize = SIZE_MAP[size] ?? 'lg';
  return (
    <Avatar
      src={src ?? fallbackSrc}
      alt={alt}
      name={alt}
      size={avatarSize}
      priority={priority}
      className={className}
      fallbackSrc={fallbackSrc}
    />
  );
}

// Responsive avatar that adapts to screen size (thin wrapper for compatibility)
interface ResponsiveAvatarProps extends Omit<OptimizedAvatarProps, 'size'> {
  readonly sizes?: string;
  readonly mobileSize?: number;
  readonly desktopSize?: number;
}

export function ResponsiveAvatar({
  src,
  alt,
  className,
  priority = false,
  fallbackSrc = '/android-chrome-192x192.png',
  desktopSize = 128,
}: ResponsiveAvatarProps) {
  const avatarSize =
    SIZE_MAP[(desktopSize as keyof typeof SIZE_MAP) ?? 128] ?? 'display-md';

  return (
    <Avatar
      src={src ?? fallbackSrc}
      alt={alt}
      name={alt}
      size={avatarSize}
      priority={priority}
      className={className}
      fallbackSrc={fallbackSrc}
    />
  );
}
