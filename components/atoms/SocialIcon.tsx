import {
  type SimpleIcon,
  siApplemusic,
  siBandcamp,
  siDiscord,
  siFacebook,
  siGithub,
  siGooglechrome,
  siInstagram,
  siLine,
  siMedium,
  siOnlyfans,
  siPatreon,
  siPinterest,
  siQuora,
  siReddit,
  siRumble,
  siSnapchat,
  siSoundcloud,
  siSpotify,
  siTelegram,
  siThreads,
  siTiktok,
  siTumblr,
  siTwitch,
  siVenmo,
  siViber,
  siVimeo,
  siX,
  siYoutube,
} from 'simple-icons';

export const SOCIAL_ICON_DEFAULT_SIZE = 16;

interface SocialIconProps {
  platform: string;
  className?: string;
  size?: number;
  ariaLabel?: string;
  title?: string;
}

// Map platform names to Simple Icons
const platformMap: Record<string, SimpleIcon> = {
  instagram: siInstagram,
  twitter: siX,
  x: siX,
  tiktok: siTiktok,
  youtube: siYoutube,
  facebook: siFacebook,
  spotify: siSpotify,
  apple: siApplemusic,
  applemusic: siApplemusic,
  apple_music: siApplemusic,
  soundcloud: siSoundcloud,
  bandcamp: siBandcamp,
  discord: siDiscord,
  reddit: siReddit,
  pinterest: siPinterest,
  tumblr: siTumblr,
  vimeo: siVimeo,
  github: siGithub,
  medium: siMedium,
  patreon: siPatreon,
  venmo: siVenmo,
  website: siGooglechrome,
  telegram: siTelegram,
  snapchat: siSnapchat,
  onlyfans: siOnlyfans,
  quora: siQuora,
  threads: siThreads,
  line: siLine,
  viber: siViber,
  rumble: siRumble,
  twitch: siTwitch,
};

export function getPlatformIcon(platform: string): SimpleIcon | undefined {
  return platformMap[platform.toLowerCase()];
}

export function SocialIcon({
  platform,
  className,
  size,
  ariaLabel,
  title,
}: SocialIconProps) {
  const icon = platformMap[platform.toLowerCase()];
  const iconClass = className || 'h-4 w-4'; // matches SOCIAL_ICON_DEFAULT_SIZE
  const sizeStyle = size
    ? { width: size, height: size }
    : className
      ? undefined
      : { width: SOCIAL_ICON_DEFAULT_SIZE, height: SOCIAL_ICON_DEFAULT_SIZE };
  const labelled = ariaLabel ?? title;

  if (icon) {
    return (
      <svg
        className={iconClass}
        style={sizeStyle}
        fill='currentColor'
        viewBox='0 0 24 24'
        role={labelled ? 'img' : undefined}
        aria-label={ariaLabel}
        title={title}
        aria-hidden={labelled ? undefined : 'true'}
      >
        <path d={icon.path} />
      </svg>
    );
  }

  // Fallback for unknown platforms
  return (
    <svg
      className={iconClass}
      style={sizeStyle}
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'
      role={labelled ? 'img' : undefined}
      aria-label={ariaLabel}
      title={title}
      aria-hidden={labelled ? undefined : 'true'}
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1'
      />
    </svg>
  );
}
