'use client';

import Link from 'next/link';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
import { ProfileDrawerShell } from '@/features/profile/ProfileDrawerShell';

interface ReleaseCreditsDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly credits?: SmartLinkCreditGroup[];
}

function toSentenceCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function ReleaseCreditsDrawer({
  open,
  onOpenChange,
  credits,
}: ReleaseCreditsDrawerProps) {
  const visibleCredits =
    credits?.filter(group => group.entries.length > 0) ?? [];

  if (visibleCredits.length === 0) return null;

  return (
    <ProfileDrawerShell open={open} onOpenChange={onOpenChange} title='Credits'>
      <div className='space-y-5'>
        {visibleCredits.map(group => (
          <section key={group.role} aria-labelledby={`credits-${group.role}`}>
            <h3
              id={`credits-${group.role}`}
              className='text-[11px] font-semibold uppercase tracking-[0.06em] text-white/35'
            >
              {toSentenceCase(group.label)}
            </h3>
            <ul className='mt-2 space-y-1.5'>
              {group.entries.map(entry => (
                <li key={`${entry.role}-${entry.artistId}-${entry.name}`}>
                  {entry.handle ? (
                    <Link
                      href={`/${entry.handle}`}
                      className='text-[14px] font-[470] text-white/88 transition-colors hover:text-white'
                    >
                      {entry.name}
                    </Link>
                  ) : (
                    <span className='text-[14px] font-[470] text-white/88'>
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
