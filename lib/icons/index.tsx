import React from 'react';
import { SocialIcon as SocialIconComponent } from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';
import { getIconByName, getSocialIconByPlatform } from './registry';
import type {
  HeroIcon,
  IconProps,
  IconSize,
  SocialIconProps,
  SocialPlatform,
} from './types';

// Size mappings for consistent icon sizing
const sizeMap: Record<IconSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
};

/**
 * Get the appropriate CSS classes for icon sizing
 */
export function getIconSizeClasses(size?: IconSize | number): string {
  if (typeof size === 'number') {
    return `h-${size} w-${size}`;
  }
  return size ? sizeMap[size] : sizeMap.md;
}

/**
 * Get a Heroicon component by name
 *
 * @param name - The icon name from the registry
 * @returns The icon component or undefined if not found
 *
 * @example
 * ```tsx
 * const ChevronRight = getIcon('chevron-right');
 * if (ChevronRight) {
 *   return <ChevronRight className="h-5 w-5" />;
 * }
 * ```
 */
export function getIcon(name: string): HeroIcon | undefined {
  const iconEntry = getIconByName(name);
  return iconEntry?.component;
}

/**
 * Unified Icon component that automatically selects the correct icon library
 *
 * @example
 * ```tsx
 * // For UI icons (uses Heroicons)
 * <Icon name="chevron-right" size="md" />
 *
 * // For social icons (uses SocialIcon component)
 * <Icon social platform="spotify" size="lg" />
 * ```
 */
export function Icon({
  name,
  size = 'md',
  className,
  'aria-hidden': ariaHidden = true,
  'aria-label': ariaLabel,
  ...props
}: IconProps & { social?: boolean; platform?: SocialPlatform }) {
  const sizeClasses =
    typeof size === 'number' ? `h-[${size}px] w-[${size}px]` : sizeMap[size];

  // Handle social icons
  if (props.social && props.platform) {
    return (
      <SocialIconComponent
        platform={props.platform}
        className={cn(sizeClasses, className)}
        size={typeof size === 'number' ? size : undefined}
        aria-hidden={ariaHidden}
        aria-label={ariaLabel}
      />
    );
  }

  // Handle regular UI icons
  if (name) {
    const IconComponent = getIcon(name);
    if (IconComponent) {
      return (
        <IconComponent
          className={cn(sizeClasses, className)}
          aria-hidden={ariaHidden}
          aria-label={ariaLabel}
          {...props}
        />
      );
    }
  }

  // Fallback - return null if icon not found
  console.warn(`Icon "${name}" not found in registry`);
  return null;
}

/**
 * Enhanced SocialIcon wrapper with better TypeScript support
 *
 * @example
 * ```tsx
 * <SocialIcon platform="spotify" size="lg" />
 * <SocialIcon platform="instagram" className="text-pink-500" />
 * ```
 */
export function SocialIcon({
  platform,
  size = 'md',
  className,
  'aria-hidden': ariaHidden = true,
  'aria-label': ariaLabel,
}: SocialIconProps) {
  const sizeClasses =
    typeof size === 'number' ? `h-[${size}px] w-[${size}px]` : sizeMap[size];

  return (
    <SocialIconComponent
      platform={platform}
      className={cn(sizeClasses, className)}
      size={typeof size === 'number' ? size : undefined}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
    />
  );
}

/**
 * Utility function to check if a platform is supported by SocialIcon
 */
export function isSocialPlatform(platform: string): platform is SocialPlatform {
  return getSocialIconByPlatform(platform as SocialPlatform) !== undefined;
}

/**
 * Get suggested icon name based on context or keywords
 *
 * @param context - Description of what the icon is for
 * @returns Array of suggested icon names
 *
 * @example
 * ```tsx
 * const suggestions = getSuggestedIcons('close button');
 * // Returns: ['x-mark', 'x-circle']
 * ```
 */
export function getSuggestedIcons(context: string): string[] {
  const lowerContext = context.toLowerCase();
  const suggestions: string[] = [];

  // Common mappings
  const mappings: Record<string, string[]> = {
    close: ['x-mark', 'x-circle'],
    cancel: ['x-mark', 'x-circle'],
    dismiss: ['x-mark'],
    back: ['arrow-left', 'chevron-left'],
    next: ['arrow-right', 'chevron-right'],
    forward: ['arrow-right', 'chevron-right'],
    previous: ['arrow-left', 'chevron-left'],
    up: ['chevron-up', 'arrow-up'],
    down: ['chevron-down', 'arrow-down'],
    add: ['plus'],
    create: ['plus'],
    new: ['plus'],
    delete: ['trash', 'x-mark'],
    remove: ['trash', 'minus'],
    edit: ['pencil'],
    modify: ['pencil'],
    search: ['search'],
    find: ['search'],
    settings: ['settings'],
    config: ['settings'],
    user: ['user', 'user-circle'],
    profile: ['user', 'user-circle'],
    account: ['user', 'user-circle'],
    success: ['check', 'check-circle'],
    error: ['x-circle', 'warning'],
    warning: ['warning'],
    info: ['info'],
    help: ['info', 'question-mark-circle'],
    play: ['play', 'play-solid'],
    pause: ['pause', 'pause-solid'],
    favorite: ['star', 'heart'],
    like: ['heart', 'heart-solid'],
    share: ['share'],
    menu: ['menu'],
    home: ['home'],
  };

  // Find matching suggestions
  for (const [keyword, icons] of Object.entries(mappings)) {
    if (lowerContext.includes(keyword)) {
      suggestions.push(...icons);
    }
  }

  // Remove duplicates and return
  return [...new Set(suggestions)];
}

export {
  getIconByName,
  getIconsByCategory,
  getSocialIconByPlatform,
  iconRegistry,
  searchIcons,
  socialIconRegistry,
} from './registry';
// Re-export types and utilities
export type {
  HeroIcon,
  IconCategory,
  IconProps,
  IconRegistryEntry,
  IconSize,
  SocialIconProps,
  SocialIconRegistryEntry,
  SocialPlatform,
} from './types';
