import type { ComponentType, SVGProps } from 'react';

// Icon component type for Heroicons
export type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>;

// Social platform types supported by SocialIcon component
export type SocialPlatform = 
  | 'instagram' 
  | 'twitter' 
  | 'x' 
  | 'tiktok' 
  | 'youtube' 
  | 'facebook'
  | 'spotify' 
  | 'apple' 
  | 'applemusic' 
  | 'apple_music' 
  | 'soundcloud'
  | 'bandcamp' 
  | 'discord' 
  | 'reddit' 
  | 'pinterest' 
  | 'tumblr' 
  | 'vimeo'
  | 'github' 
  | 'medium' 
  | 'patreon' 
  | 'venmo' 
  | 'website';

// Icon categories for better organization
export type IconCategory = 'navigation' | 'action' | 'state' | 'social' | 'brand' | 'custom';

// Icon size presets
export type IconSize = 'sm' | 'md' | 'lg' | 'xl';

// Icon registry entry
export interface IconRegistryEntry {
  name: string;
  category: IconCategory;
  component: HeroIcon;
  description?: string;
  keywords?: string[];
}

// Social icon registry entry
export interface SocialIconRegistryEntry {
  platform: SocialPlatform;
  name: string;
  category: 'social' | 'brand';
  description?: string;
}

// Icon props for unified icon component
export interface IconProps {
  name?: string;
  size?: IconSize | number;
  className?: string;
  'aria-hidden'?: boolean;
  'aria-label'?: string;
}

// Social icon props
export interface SocialIconProps {
  platform: SocialPlatform;
  size?: IconSize | number;
  className?: string;
  'aria-hidden'?: boolean;
  'aria-label'?: string;
}

