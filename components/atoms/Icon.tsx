import React from 'react';
import { cn } from '@/lib/utils';
import { getIcon, getIconSizeClasses, getSuggestedIcons } from '@/lib/icons';
import type { IconProps, HeroIcon } from '@/lib/icons/types';

/**
 * Universal Icon component that uses the standardized icon registry
 * 
 * This component enforces the use of Heroicons for general UI icons
 * and provides helpful error messages when icons are not found.
 * 
 * @example
 * ```tsx
 * // Basic usage
 * <Icon name="chevron-right" />
 * 
 * // With custom size and styling
 * <Icon name="check-circle" size="lg" className="text-green-500" />
 * 
 * // With accessibility
 * <Icon name="x-mark" aria-label="Close dialog" aria-hidden={false} />
 * ```
 */
export function Icon({
  name,
  size = 'md',
  className,
  'aria-hidden': ariaHidden = true,
  'aria-label': ariaLabel,
  ...props
}: IconProps & { name: string }) {
  const IconComponent = getIcon(name);
  const sizeClasses = getIconSizeClasses(size);

  if (!IconComponent) {
    // Provide helpful suggestions in development
    if (process.env.NODE_ENV === 'development') {
      const suggestions = getSuggestedIcons(name);
      console.warn(
        `Icon "${name}" not found in registry.` +
        (suggestions.length > 0 
          ? ` Did you mean: ${suggestions.join(', ')}?` 
          : ' Check the icon registry for available icons.')
      );
    }

    // Return a placeholder in development, nothing in production
    if (process.env.NODE_ENV === 'development') {
      return (
        <div
          className={cn(
            sizeClasses,
            'border border-dashed border-red-300 bg-red-50 flex items-center justify-center text-red-500 text-xs',
            className
          )}
          title={`Icon "${name}" not found`}
          aria-hidden={ariaHidden}
          aria-label={ariaLabel || `Missing icon: ${name}`}
        >
          ?
        </div>
      );
    }

    return null;
  }

  return (
    <IconComponent
      className={cn(sizeClasses, className)}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      {...props}
    />
  );
}

/**
 * Icon component with explicit TypeScript support for all registered icons
 * This provides better autocomplete and type safety
 */
export type RegisteredIconName = 
  | 'chevron-right' | 'chevron-left' | 'chevron-up' | 'chevron-down'
  | 'arrow-right' | 'arrow-left' | 'arrow-up' | 'arrow-down'
  | 'home' | 'menu'
  | 'plus' | 'minus' | 'x-mark' | 'pencil' | 'trash' | 'share' | 'search' | 'settings'
  | 'check' | 'check-circle' | 'check-circle-solid' | 'x-circle' | 'x-circle-solid' | 'warning' | 'info'
  | 'star' | 'star-solid' | 'heart' | 'heart-solid' | 'bell' | 'envelope' | 'document' | 'folder' | 'photo' | 'video'
  | 'user' | 'user-circle' | 'user-circle-solid' | 'user-group'
  | 'play' | 'play-solid' | 'pause' | 'pause-solid' | 'volume' | 'volume-mute';

export interface TypedIconProps extends Omit<IconProps, 'name'> {
  name: RegisteredIconName;
}

/**
 * Typed Icon component with autocomplete support
 */
export function TypedIcon(props: TypedIconProps) {
  return <Icon {...props} />;
}

/**
 * Higher-order component to create icon components with predefined props
 * 
 * @example
 * ```tsx
 * const CloseButton = createIconComponent('x-mark', { 
 *   size: 'sm', 
 *   className: 'text-gray-500 hover:text-gray-700' 
 * });
 * 
 * // Usage
 * <CloseButton aria-label="Close" />
 * ```
 */
export function createIconComponent(
  name: RegisteredIconName,
  defaultProps?: Partial<IconProps>
) {
  return function IconComponent(props: Partial<IconProps>) {
    return <Icon name={name} {...defaultProps} {...props} />;
  };
}

/**
 * Utility component for rendering icons with consistent button styling
 * This is useful for icon-only buttons that need consistent sizing and spacing
 */
export interface IconButtonIconProps extends IconProps {
  name: RegisteredIconName;
  interactive?: boolean;
}

export function IconButtonIcon({ 
  name, 
  interactive = false, 
  className, 
  ...props 
}: IconButtonIconProps) {
  return (
    <Icon
      name={name}
      className={cn(
        interactive && 'transition-colors duration-200',
        className
      )}
      {...props}
    />
  );
}

// Pre-built common icon components for convenience
export const ChevronRightIcon = createIconComponent('chevron-right');
export const ChevronLeftIcon = createIconComponent('chevron-left');
export const XMarkIcon = createIconComponent('x-mark');
export const CheckIcon = createIconComponent('check');
export const PlusIcon = createIconComponent('plus');
export const SearchIcon = createIconComponent('search');
export const SettingsIcon = createIconComponent('settings');
export const UserIcon = createIconComponent('user');
export const HomeIcon = createIconComponent('home');
export const MenuIcon = createIconComponent('menu');

