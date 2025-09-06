import {
  // Navigation icons
  ChevronRightIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  HomeIcon,
  Bars3Icon,
  
  // Action icons
  PlusIcon,
  MinusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  ShareIcon,
  MagnifyingGlassIcon,
  CogIcon,
  
  // State icons
  CheckIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  
  // Content icons
  StarIcon,
  HeartIcon,
  BellIcon,
  EnvelopeIcon,
  DocumentIcon,
  FolderIcon,
  PhotoIcon,
  VideoCameraIcon,
  
  // User icons
  UserIcon,
  UserCircleIcon,
  UserGroupIcon,
  
  // Media icons
  PlayIcon,
  PauseIcon,
  StopIcon,
  ForwardIcon,
  BackwardIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  
  // Utility icons
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  PhoneIcon,
  LinkIcon,
  ArrowTopRightOnSquareIcon,
  QuestionMarkCircleIcon,
  ExclamationCircleIcon,
  
  // Interface icons
  EyeIcon,
  EyeSlashIcon,
  AdjustmentsHorizontalIcon,
  FunnelIcon,
  Squares2X2Icon,
  ListBulletIcon,
  
} from '@heroicons/react/24/outline';

import {
  // Solid variants for emphasis
  StarIcon as StarIconSolid,
  HeartIcon as HeartIconSolid,
  CheckCircleIcon as CheckCircleIconSolid,
  XCircleIcon as XCircleIconSolid,
  PlayIcon as PlayIconSolid,
  PauseIcon as PauseIconSolid,
  UserCircleIcon as UserCircleIconSolid,
} from '@heroicons/react/24/solid';

import type { IconRegistryEntry, SocialIconRegistryEntry, SocialPlatform } from './types';

// Heroicons registry organized by category
export const iconRegistry: Record<string, IconRegistryEntry> = {
  // Navigation
  'chevron-right': {
    name: 'chevron-right',
    category: 'navigation',
    component: ChevronRightIcon,
    description: 'Right-pointing chevron for navigation',
    keywords: ['arrow', 'next', 'forward', 'right'],
  },
  'chevron-left': {
    name: 'chevron-left',
    category: 'navigation',
    component: ChevronLeftIcon,
    description: 'Left-pointing chevron for navigation',
    keywords: ['arrow', 'back', 'previous', 'left'],
  },
  'chevron-up': {
    name: 'chevron-up',
    category: 'navigation',
    component: ChevronUpIcon,
    description: 'Up-pointing chevron',
    keywords: ['arrow', 'up', 'collapse'],
  },
  'chevron-down': {
    name: 'chevron-down',
    category: 'navigation',
    component: ChevronDownIcon,
    description: 'Down-pointing chevron',
    keywords: ['arrow', 'down', 'expand', 'dropdown'],
  },
  'arrow-right': {
    name: 'arrow-right',
    category: 'navigation',
    component: ArrowRightIcon,
    description: 'Right-pointing arrow',
    keywords: ['next', 'forward', 'right', 'continue'],
  },
  'arrow-left': {
    name: 'arrow-left',
    category: 'navigation',
    component: ArrowLeftIcon,
    description: 'Left-pointing arrow',
    keywords: ['back', 'previous', 'left', 'return'],
  },
  'home': {
    name: 'home',
    category: 'navigation',
    component: HomeIcon,
    description: 'Home icon',
    keywords: ['house', 'main', 'dashboard'],
  },
  'menu': {
    name: 'menu',
    category: 'navigation',
    component: Bars3Icon,
    description: 'Hamburger menu icon',
    keywords: ['hamburger', 'bars', 'navigation'],
  },

  // Actions
  'plus': {
    name: 'plus',
    category: 'action',
    component: PlusIcon,
    description: 'Plus icon for adding items',
    keywords: ['add', 'create', 'new'],
  },
  'minus': {
    name: 'minus',
    category: 'action',
    component: MinusIcon,
    description: 'Minus icon for removing items',
    keywords: ['remove', 'subtract', 'delete'],
  },
  'x-mark': {
    name: 'x-mark',
    category: 'action',
    component: XMarkIcon,
    description: 'X mark for closing or canceling',
    keywords: ['close', 'cancel', 'dismiss', 'x'],
  },
  'pencil': {
    name: 'pencil',
    category: 'action',
    component: PencilIcon,
    description: 'Pencil icon for editing',
    keywords: ['edit', 'modify', 'write'],
  },
  'trash': {
    name: 'trash',
    category: 'action',
    component: TrashIcon,
    description: 'Trash can for deleting items',
    keywords: ['delete', 'remove', 'bin'],
  },
  'share': {
    name: 'share',
    category: 'action',
    component: ShareIcon,
    description: 'Share icon',
    keywords: ['export', 'send', 'distribute'],
  },
  'search': {
    name: 'search',
    category: 'action',
    component: MagnifyingGlassIcon,
    description: 'Magnifying glass for search',
    keywords: ['find', 'lookup', 'magnify'],
  },
  'settings': {
    name: 'settings',
    category: 'action',
    component: CogIcon,
    description: 'Cog icon for settings',
    keywords: ['config', 'preferences', 'options'],
  },

  // States
  'check': {
    name: 'check',
    category: 'state',
    component: CheckIcon,
    description: 'Check mark for success or completion',
    keywords: ['success', 'complete', 'done', 'valid'],
  },
  'check-circle': {
    name: 'check-circle',
    category: 'state',
    component: CheckCircleIcon,
    description: 'Check mark in circle for success',
    keywords: ['success', 'complete', 'valid', 'approved'],
  },
  'check-circle-solid': {
    name: 'check-circle-solid',
    category: 'state',
    component: CheckCircleIconSolid,
    description: 'Solid check mark in circle',
    keywords: ['success', 'complete', 'valid', 'approved'],
  },
  'x-circle': {
    name: 'x-circle',
    category: 'state',
    component: XCircleIcon,
    description: 'X mark in circle for errors',
    keywords: ['error', 'invalid', 'failed', 'wrong'],
  },
  'x-circle-solid': {
    name: 'x-circle-solid',
    category: 'state',
    component: XCircleIconSolid,
    description: 'Solid X mark in circle',
    keywords: ['error', 'invalid', 'failed', 'wrong'],
  },
  'warning': {
    name: 'warning',
    category: 'state',
    component: ExclamationTriangleIcon,
    description: 'Warning triangle',
    keywords: ['alert', 'caution', 'attention'],
  },
  'info': {
    name: 'info',
    category: 'state',
    component: InformationCircleIcon,
    description: 'Information circle',
    keywords: ['help', 'details', 'about'],
  },

  // Content
  'star': {
    name: 'star',
    category: 'action',
    component: StarIcon,
    description: 'Star for favorites or ratings',
    keywords: ['favorite', 'rating', 'bookmark'],
  },
  'star-solid': {
    name: 'star-solid',
    category: 'action',
    component: StarIconSolid,
    description: 'Solid star for favorites',
    keywords: ['favorite', 'rating', 'bookmark', 'filled'],
  },
  'heart': {
    name: 'heart',
    category: 'action',
    component: HeartIcon,
    description: 'Heart for likes or favorites',
    keywords: ['like', 'love', 'favorite'],
  },
  'heart-solid': {
    name: 'heart-solid',
    category: 'action',
    component: HeartIconSolid,
    description: 'Solid heart for likes',
    keywords: ['like', 'love', 'favorite', 'filled'],
  },
  'bell': {
    name: 'bell',
    category: 'action',
    component: BellIcon,
    description: 'Bell for notifications',
    keywords: ['notification', 'alert', 'reminder'],
  },
  'envelope': {
    name: 'envelope',
    category: 'action',
    component: EnvelopeIcon,
    description: 'Envelope for email or messages',
    keywords: ['email', 'mail', 'message'],
  },
  'document': {
    name: 'document',
    category: 'action',
    component: DocumentIcon,
    description: 'Document icon',
    keywords: ['file', 'paper', 'text'],
  },
  'folder': {
    name: 'folder',
    category: 'action',
    component: FolderIcon,
    description: 'Folder icon',
    keywords: ['directory', 'organize'],
  },
  'photo': {
    name: 'photo',
    category: 'action',
    component: PhotoIcon,
    description: 'Photo or image icon',
    keywords: ['image', 'picture', 'gallery'],
  },
  'video': {
    name: 'video',
    category: 'action',
    component: VideoCameraIcon,
    description: 'Video camera icon',
    keywords: ['camera', 'record', 'film'],
  },

  // User
  'user': {
    name: 'user',
    category: 'action',
    component: UserIcon,
    description: 'User profile icon',
    keywords: ['profile', 'account', 'person'],
  },
  'user-circle': {
    name: 'user-circle',
    category: 'action',
    component: UserCircleIcon,
    description: 'User in circle',
    keywords: ['profile', 'account', 'avatar'],
  },
  'user-circle-solid': {
    name: 'user-circle-solid',
    category: 'action',
    component: UserCircleIconSolid,
    description: 'Solid user in circle',
    keywords: ['profile', 'account', 'avatar', 'filled'],
  },
  'user-group': {
    name: 'user-group',
    category: 'action',
    component: UserGroupIcon,
    description: 'Group of users',
    keywords: ['team', 'group', 'people'],
  },

  // Media controls
  'play': {
    name: 'play',
    category: 'action',
    component: PlayIcon,
    description: 'Play button',
    keywords: ['start', 'begin', 'media'],
  },
  'play-solid': {
    name: 'play-solid',
    category: 'action',
    component: PlayIconSolid,
    description: 'Solid play button',
    keywords: ['start', 'begin', 'media', 'filled'],
  },
  'pause': {
    name: 'pause',
    category: 'action',
    component: PauseIcon,
    description: 'Pause button',
    keywords: ['stop', 'halt', 'media'],
  },
  'pause-solid': {
    name: 'pause-solid',
    category: 'action',
    component: PauseIconSolid,
    description: 'Solid pause button',
    keywords: ['stop', 'halt', 'media', 'filled'],
  },
  'volume': {
    name: 'volume',
    category: 'action',
    component: SpeakerWaveIcon,
    description: 'Volume/speaker icon',
    keywords: ['sound', 'audio', 'speaker'],
  },
  'volume-mute': {
    name: 'volume-mute',
    category: 'action',
    component: SpeakerXMarkIcon,
    description: 'Muted volume icon',
    keywords: ['mute', 'silent', 'no-sound'],
  },
};

// Social platform registry
export const socialIconRegistry: Record<SocialPlatform, SocialIconRegistryEntry> = {
  instagram: {
    platform: 'instagram',
    name: 'Instagram',
    category: 'social',
    description: 'Instagram social media platform',
  },
  twitter: {
    platform: 'twitter',
    name: 'Twitter/X',
    category: 'social',
    description: 'Twitter (now X) social media platform',
  },
  x: {
    platform: 'x',
    name: 'X (Twitter)',
    category: 'social',
    description: 'X (formerly Twitter) social media platform',
  },
  tiktok: {
    platform: 'tiktok',
    name: 'TikTok',
    category: 'social',
    description: 'TikTok social media platform',
  },
  youtube: {
    platform: 'youtube',
    name: 'YouTube',
    category: 'social',
    description: 'YouTube video platform',
  },
  facebook: {
    platform: 'facebook',
    name: 'Facebook',
    category: 'social',
    description: 'Facebook social media platform',
  },
  spotify: {
    platform: 'spotify',
    name: 'Spotify',
    category: 'brand',
    description: 'Spotify music streaming platform',
  },
  apple: {
    platform: 'apple',
    name: 'Apple Music',
    category: 'brand',
    description: 'Apple Music streaming platform',
  },
  applemusic: {
    platform: 'applemusic',
    name: 'Apple Music',
    category: 'brand',
    description: 'Apple Music streaming platform',
  },
  apple_music: {
    platform: 'apple_music',
    name: 'Apple Music',
    category: 'brand',
    description: 'Apple Music streaming platform',
  },
  soundcloud: {
    platform: 'soundcloud',
    name: 'SoundCloud',
    category: 'brand',
    description: 'SoundCloud audio platform',
  },
  bandcamp: {
    platform: 'bandcamp',
    name: 'Bandcamp',
    category: 'brand',
    description: 'Bandcamp music platform',
  },
  discord: {
    platform: 'discord',
    name: 'Discord',
    category: 'social',
    description: 'Discord communication platform',
  },
  reddit: {
    platform: 'reddit',
    name: 'Reddit',
    category: 'social',
    description: 'Reddit social platform',
  },
  pinterest: {
    platform: 'pinterest',
    name: 'Pinterest',
    category: 'social',
    description: 'Pinterest visual discovery platform',
  },
  tumblr: {
    platform: 'tumblr',
    name: 'Tumblr',
    category: 'social',
    description: 'Tumblr microblogging platform',
  },
  vimeo: {
    platform: 'vimeo',
    name: 'Vimeo',
    category: 'social',
    description: 'Vimeo video platform',
  },
  github: {
    platform: 'github',
    name: 'GitHub',
    category: 'brand',
    description: 'GitHub code repository platform',
  },
  medium: {
    platform: 'medium',
    name: 'Medium',
    category: 'social',
    description: 'Medium publishing platform',
  },
  patreon: {
    platform: 'patreon',
    name: 'Patreon',
    category: 'brand',
    description: 'Patreon creator support platform',
  },
  venmo: {
    platform: 'venmo',
    name: 'Venmo',
    category: 'brand',
    description: 'Venmo payment platform',
  },
  website: {
    platform: 'website',
    name: 'Website',
    category: 'brand',
    description: 'Generic website link',
  },
};

// Helper functions
export function getIconByName(name: string): IconRegistryEntry | undefined {
  return iconRegistry[name];
}

export function getSocialIconByPlatform(platform: SocialPlatform): SocialIconRegistryEntry | undefined {
  return socialIconRegistry[platform];
}

export function searchIcons(query: string): IconRegistryEntry[] {
  const lowerQuery = query.toLowerCase();
  return Object.values(iconRegistry).filter(icon => 
    icon.name.includes(lowerQuery) ||
    icon.description?.toLowerCase().includes(lowerQuery) ||
    icon.keywords?.some(keyword => keyword.includes(lowerQuery))
  );
}

export function getIconsByCategory(category: string): IconRegistryEntry[] {
  return Object.values(iconRegistry).filter(icon => icon.category === category);
}

