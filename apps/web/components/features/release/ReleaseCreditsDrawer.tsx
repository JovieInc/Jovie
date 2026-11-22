'use client';

import Link from 'next/link';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
import type { ProfileSurfacePresentation } from '@/features/profile/contracts';
import { ProfileDrawerShell } from '@/features/profile/ProfileDrawerShell';

interface ReleaseCreditsDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly credits?: SmartLinkCreditGroup[];
  readonly presentation?: ProfileSurfacePresentation;
  readonly anchorRef?: React.RefObject<HTMLElement | null>;
}

function toSentenceCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function ReleaseCreditsDrawer({
  open,
  onOpenChange,
  credits,
  presentation,
  anchorRef,
}: ReleaseCreditsDrawerProps) {
  const visibleCredits =
    credits?.filter(group => group.entries.length > 0) ?? [];

  if (visibleCredits.length === 0) return null;

  return (
    <ProfileDrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title='Credits'
      presentation={presentation}
      anchorRef={anchorRef}
      navigationLevel={anchorRef ? 'direct' : undefined}
    >
      <div className='space-y-5'>
        {visibleCredits.map(group => (
          <section key={group.role} aria-labelledby={`credits-${group.role}`}>
            <h3
              id={`credits-${group.role}`}
              className='text-2xs font-semibold tracking-[0.06em] text-on-media/50'
            >
              {toSentenceCase(group.label)}
            </h3>
            <ul className='mt-2 space-y-1.5'>
              {group.entries.map(entry => (
                <li key={`${entry.role}-${entry.artistId}-${entry.name}`}>
                  {entry.handle ? (
                    <Link
                      href={`/${entry.handle}`}
                      className='text-sm font-[470] text-on-media/88 transition-colors hover:text-on-media'
                    >
                      {entry.name}
                    </Link>
                  ) : (
                    <span className='text-sm font-[470] text-on-media/88'>
                      {entry.name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </ProfileDrawerShell>
  );
}
