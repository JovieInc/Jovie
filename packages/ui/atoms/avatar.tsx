'use client';

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

interface AvatarContextValue {
  readonly size: AvatarSize;
  readonly shape: AvatarShape;
}

const AvatarContext = React.createContext<AvatarContextValue | null>(null);

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
    {
      size = 'md',
      ring = false,
      shape = 'person',
      className,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const px = getAvatarSizePx(size);
    const isPerson = shape === 'person';
    const contextValue = React.useMemo(() => ({ size, shape }), [size, shape]);
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
      >
        <AvatarContext.Provider value={contextValue}>
          {children}
        </AvatarContext.Provider>
      </span>
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
  ({ className, alt = '', size, shape, ...props }, ref) => {
    const context = React.useContext(AvatarContext);
    const resolvedSize = context?.size ?? size ?? 'md';
    const resolvedShape = context?.shape ?? shape ?? 'person';

    return (
      <img
        ref={ref}
        alt={alt}
        className={cn(
          'h-full w-full',
          className,
          resolvedShape === 'artwork' ? 'object-contain' : 'object-cover',
          getAvatarShapeClassName(resolvedShape, getAvatarSizePx(resolvedSize))
        )}
        {...props}
      />
    );
  }
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
  ({ size, shape, className, ...props }, ref) => {
    const context = React.useContext(AvatarContext);
    const resolvedSize = context?.size ?? size ?? 'md';
    const resolvedShape = context?.shape ?? shape ?? 'person';

    return (
      <span
        ref={ref}
        className={cn(
          'flex h-full w-full items-center justify-center font-medium select-none',
          'overflow-hidden bg-surface-2 text-secondary-token',
          AVATAR_SIZE_MAP[resolvedSize].text,
          className,
          getAvatarShapeClassName(resolvedShape, getAvatarSizePx(resolvedSize))
        )}
        {...props}
      />
    );
  }
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

function AvatarStatusDot({ status, size, className }: AvatarStatusDotProps) {
  const context = React.useContext(AvatarContext);
  const resolvedSize = context?.size ?? size ?? 'md';
  const { dot, dotOffset } = AVATAR_SIZE_MAP[resolvedSize];
  return (
    <span
      role='img'
      aria-label={`${status} status`}
      data-size={resolvedSize}
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
        <AvatarImage src={src} alt={altText} />
      ) : (
        <AvatarFallback>{initials}</AvatarFallback>
      )}
      {status && <AvatarStatusDot status={status} />}
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
