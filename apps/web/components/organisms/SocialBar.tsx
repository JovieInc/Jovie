import { SocialLink } from '@/components/molecules/SocialLink';
import type { LegacySocialLink as SocialLinkType } from '@/types/db';

interface SocialBarProps {
  readonly handle: string;
  readonly artistName: string;
  readonly socialLinks: SocialLinkType[];
}

export function SocialBar({ handle, artistName, socialLinks }: SocialBarProps) {
  return (
    <div
      className={`flex flex-wrap justify-center gap-3 ${socialLinks.length === 0 ? 'hidden' : ''}`}
    >
      {socialLinks.map(link => (
        <SocialLink
          key={link.id}
          link={link}
          handle={handle}
          artistName={artistName}
        />
      ))}
    </div>
  );
}
