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
  siTidal,
  siTiktok,
  siTumblr,
  siTwitch,
  siVenmo,
  siViber,
  siVimeo,
  siX,
  siYoutube,
} from 'simple-icons';

// no-op

interface SocialIconProps {
  platform: string;
  className?: string;
  size?: number;
  'aria-hidden'?: boolean;
  'aria-label'?: string;
}

// Map platform names to Simple Icons
const platformMap: Record<string, SimpleIcon> = {
  instagram: siInstagram,
  twitter: siX,
  x: siX,
  tiktok: siTiktok,
  youtube: siYoutube,
  youtube_music: siYoutube,
  youtubemusic: siYoutube,
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
  tidal: siTidal,
};

export function getPlatformIcon(platform: string): SimpleIcon | undefined {
  return platformMap[platform.toLowerCase()];
}

export function SocialIcon({
  platform,
  className,
  size,
  'aria-hidden': ariaHidden = true,
  'aria-label': ariaLabel,
}: Readonly<SocialIconProps>) {
  const icon = platformMap[platform.toLowerCase()];
  const iconClass = className || 'h-4 w-4';
  const sizeStyle = size ? { width: size, height: size } : undefined;
  const _accessibilityProps: {
    'aria-label'?: string;
    'aria-hidden'?: boolean;
  } = ariaLabel ? { 'aria-label': ariaLabel } : { 'aria-hidden': true };

  if (icon) {
    return (
      // NOSONAR S6819: SVG requires role="img" for accessibility; native <img> cannot render inline SVGs
      <svg
        className={iconClass}
        style={sizeStyle}
        fill='currentColor'
        viewBox='0 0 24 24'
        aria-hidden={ariaHidden}
        aria-label={ariaLabel}
        role={ariaLabel ? 'img' : undefined}
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
      aria-hidden='true'
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
