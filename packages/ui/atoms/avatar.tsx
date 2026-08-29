import { cn } from '@jovie/ui/lib/utils';
import * as React from 'react';

import {
  AVATAR_OUTLINE_CLASSNAME,
  AVATAR_RING_CLASSNAME,
  AVATAR_SIZE_MAP,
  type AvatarShape,
  type AvatarSize,
  getAvatarShapeClassName,
  getAvatarSizePx,
} from './avatar-contract';

export type { AvatarShape, AvatarSize } from './avatar-contract';
export {
  AVATAR_OUTLINE_CLASSNAME,
  AVATAR_PERSON_RADIUS_CLASSNAME,
  AVATAR_RING_CLASSNAME,
  AVATAR_SHAPE_NAMES,
  AVATAR_SIZE_MAP,
  AVATAR_SIZE_NAMES,
  getAvatarArtworkRadiusClassName,
  getAvatarShapeClassName,
  getAvatarSizePx,
} from './avatar-contract';

export type AvatarStatus = 'online' | 'away' | 'offline';

// ---------------------------------------------------------------------------
// Primitive building blocks — exported for composability
// ---------------------------------------------------------------------------

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  readonly size?: AvatarSize;
  readonly ring?: boolean;
  /** Person/user avatars are circular; release artwork is rounded-square. */
  readonly shape?: AvatarShape;
}

/** Root container. Shape class is last so local className cannot change crop. */
const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  (
    { size = 'md', ring = false, shape = 'person', className, style, ...props },
    ref
  ) => {
    const px = getAvatarSizePx(size);
    const isPerson = shape === 'person';
    return (
      <span
        ref={ref}
        data-ring={ring ? 'true' : 'false'}
        data-size={size}
        data-shape={shape}
        className={cn(
          'relative isolate inline-flex shrink-0 items-center justify-center',
          isPerson ? 'overflow-visible' : 'overflow-hidden',
          AVATAR_OUTLINE_CLASSNAME,
          ring && AVATAR_RING_CLASSNAME,
          className,
          getAvatarShapeClassName(shape, px)
        )}
        style={{ width: px, height: px, ...style }}
        {...props}
      />
    );
  }
);
Avatar.displayName = 'Avatar';

// ---------------------------------------------------------------------------

export interface AvatarImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  readonly size?: AvatarSize;
  readonly shape?: AvatarShape;
}

/**
 * `AvatarImage` — rendered inside `Avatar`.
 * Hides itself via CSS if the image fails to load (browser default for broken imgs).
 */
const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, alt = '', size = 'md', shape = 'person', ...props }, ref) => (
    <img
      ref={ref}
      alt={alt}
      className={cn(
        'h-full w-full object-cover',
        className,
        getAvatarShapeClassName(shape, getAvatarSizePx(size))
      )}
      {...props}
    />
  )
);
AvatarImage.displayName = 'AvatarImage';

// ---------------------------------------------------------------------------

export interface AvatarFallbackProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  readonly size?: AvatarSize;
  readonly shape?: AvatarShape;
}

/**
 * `AvatarFallback` — shown when no image is provided. Styled as initials.
 */
const AvatarFallback = React.forwardRef<HTMLSpanElement, AvatarFallbackProps>(
  ({ size = 'md', shape = 'person', className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'flex h-full w-full items-center justify-center font-medium select-none',
        'overflow-hidden bg-surface-2 text-secondary-token',
        AVATAR_SIZE_MAP[size].text,
        className,
        getAvatarShapeClassName(shape, getAvatarSizePx(size))
      )}
      {...props}
    />
  )
);
AvatarFallback.displayName = 'AvatarFallback';

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<AvatarStatus, string> = {
  online: 'bg-success',
  away: 'bg-warning',
  offline: 'bg-tertiary-token',
};

export interface AvatarStatusDotProps {
  readonly status: AvatarStatus;
  readonly size?: AvatarSize;
  readonly className?: string;
}

function AvatarStatusDot({
  status,
  size = 'md',
  className,
}: AvatarStatusDotProps) {
  const { dot, dotOffset } = AVATAR_SIZE_MAP[size];
  return (
    <span
      role='img'
      aria-label={`${status} status`}
      data-size={size}
      data-status={status}
      className={cn(
        'absolute rounded-full',
        AVATAR_RING_CLASSNAME,
        dot,
        dotOffset,
        STATUS_COLOR[status],
        className
      )}
    >
      <span className='sr-only'>{status}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Higher-level UserAvatar
// ---------------------------------------------------------------------------

/** Derive up-to-2-char initials from a full name string. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === '') return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + (parts.at(-1) || '').charAt(0)).toUpperCase();
}

export interface UserAvatarProps {
  /** Image URL — if omitted or fails, initials are shown. */
  readonly src?: string;
  /** Full name used for initials and alt text. */
  readonly name?: string;
  readonly size?: AvatarSize;
  readonly status?: AvatarStatus;
  /** Show ring separator (useful for stacked groups). */
  readonly ring?: boolean;
  readonly className?: string;
}

function UserAvatar({
  src,
  name = '',
  size = 'md',
  status,
  ring = false,
  className,
}: UserAvatarProps) {
  const initials = name ? getInitials(name) : '?';
  const altText = name || 'Avatar';

  return (
    <Avatar size={size} ring={ring} shape='person' className={className}>
      {src ? (
        <AvatarImage src={src} alt={altText} size={size} shape='person' />
      ) : (
        <AvatarFallback size={size} shape='person'>
          {initials}
        </AvatarFallback>
      )}
      {status && <AvatarStatusDot status={status} size={size} />}
    </Avatar>
  );
}

// ---------------------------------------------------------------------------

export {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarStatusDot,
  getInitials,
  UserAvatar,
};
