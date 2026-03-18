'use client';

import {
  Check,
  Instagram,
  Music,
  QrCode,
  UserPlus,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';

/* ------------------------------------------------------------------ */
/*  Types & config                                                    */
/* ------------------------------------------------------------------ */

interface ChecklistItem {
  id: string;
  icon: React.ElementType;
  label: string;
  description: string;
  href?: string;
  action?: 'copy-url';
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: 'share-instagram',
    icon: Instagram,
    label: 'Share your profile on Instagram',
    description: 'Post your link to your story or bio',
  },
  {
    id: 'spotify-bio',
    icon: Music,
    label: 'Add your Jovie link to your Spotify bio',
    description: 'Fans searching for you will find everything',
    action: 'copy-url',
  },
  {
    id: 'qr-code',
    icon: QrCode,
    label: 'Download a QR code for your next show',
    description: 'Print it for merch tables and venues',
  },
  {
    id: 'invite-artist',
    icon: UserPlus,
    label: 'Invite an artist friend',
    description: 'Earn 50% commission for 24 months',
    href: `${APP_ROUTES.SETTINGS}/referral`,
  },
  {
    id: 'connect-venmo',
    icon: Wallet,
    label: 'Connect Venmo for tips',
    description: 'Let fans support you directly',
    href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getStorageKey(userId: string) {
  return `jovie:getting-started:${userId}`;
}

function loadCompleted(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveCompleted(userId: string, completed: Set<string>) {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify([...completed]));
  } catch {
    // ignore
  }
}

function getDismissKey(userId: string) {
  return `jovie:getting-started-dismissed:${userId}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

interface GetStartedChecklistCardProps {
  readonly userId: string;
  readonly profileUrl?: string;
}

export function GetStartedChecklistCard({
  userId,
  profileUrl,
}: GetStartedChecklistCardProps) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState(true); // default hidden until client check
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCompleted(loadCompleted(userId));

    try {
      const dismissedUntil = localStorage.getItem(getDismissKey(userId));
      if (dismissedUntil) {
        // Session dismiss: stored as timestamp, expires after 24h
        const ts = Number.parseInt(dismissedUntil, 10);
        if (Date.now() < ts) {
          setDismissed(true);
          return;
        }
      }
      setDismissed(false);
    } catch {
      setDismissed(false);
    }
  }, [userId]);

  const toggleItem = useCallback(
    (itemId: string) => {
      setCompleted(prev => {
        const next = new Set(prev);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
          track('getting_started_item_completed', { item: itemId });
        }
        saveCompleted(userId, next);
        return next;
      });
    },
    [userId]
  );

  const handleDismiss = useCallback(() => {
    track('getting_started_dismissed');
    try {
      // Dismiss for 24 hours
      const expires = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem(getDismissKey(userId), String(expires));
    } catch {
      // ignore
    }
    setDismissed(true);
  }, [userId]);

  const handleCopyUrl = useCallback(() => {
    if (profileUrl) {
      navigator.clipboard.writeText(profileUrl).catch(() => {});
    }
  }, [profileUrl]);

  if (!mounted) return null;

  const completedCount = completed.size;
  const allDone = completedCount >= CHECKLIST_ITEMS.length;

  // Hide permanently when all done, or temporarily when dismissed
  if (allDone || dismissed) return null;

  return (
    <ContentSurfaceCard className='overflow-hidden'>
      <div className='flex items-center justify-between p-3 sm:p-4'>
        <div>
          <h3 className='text-[13px] font-[590] text-primary-token'>
            Get started
          </h3>
          <p className='text-[12px] text-tertiary-token'>
            {completedCount} of {CHECKLIST_ITEMS.length} complete
          </p>
        </div>
        <button
          type='button'
          onClick={handleDismiss}
          className='text-[12px] text-tertiary-token transition-colors hover:text-secondary-token'
        >
          Later
        </button>
      </div>

      {/* Progress bar */}
      <div className='mx-3 mb-2 h-1 rounded-full bg-surface-2 sm:mx-4'>
        <div
          className='h-1 rounded-full bg-[var(--linear-accent)] transition-all duration-300'
          style={{
            width: `${(completedCount / CHECKLIST_ITEMS.length) * 100}%`,
          }}
        />
      </div>

      <ul className='space-y-0.5 px-2 pb-3 sm:px-3'>
        {CHECKLIST_ITEMS.map(item => {
          const isDone = completed.has(item.id);

          const content = (
            <li
              key={item.id}
              className={`flex items-center gap-3 rounded-lg px-2 py-2 transition-colors ${
                isDone ? 'opacity-60' : 'hover:bg-surface-1'
              }`}
            >
              <button
                type='button'
                onClick={e => {
                  e.stopPropagation();
                  toggleItem(item.id);
                }}
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isDone
                    ? 'border-[var(--linear-accent)] bg-[var(--linear-accent)]'
                    : 'border-subtle hover:border-secondary-token'
                }`}
                aria-label={
                  isDone ? `Unmark ${item.label}` : `Mark ${item.label} as done`
                }
              >
                {isDone ? (
                  <Check className='h-3 w-3 text-white' aria-hidden='true' />
                ) : null}
              </button>

              <item.icon
                className='h-4 w-4 flex-shrink-0 text-tertiary-token'
                aria-hidden='true'
              />

              <div className='min-w-0 flex-1'>
                <p
                  className={`text-[13px] font-[450] ${isDone ? 'line-through text-tertiary-token' : 'text-primary-token'}`}
                >
                  {item.label}
                </p>
                <p className='text-[11px] text-tertiary-token'>
                  {item.description}
                </p>
              </div>

              {!isDone && item.action === 'copy-url' && (
                <button
                  type='button'
                  onClick={e => {
                    e.stopPropagation();
                    handleCopyUrl();
                  }}
                  className='text-[11px] font-[510] text-secondary-token transition-colors hover:text-primary-token'
                >
                  Copy link
                </button>
              )}
            </li>
          );

          if (!isDone && item.href) {
            return (
              <li
                key={item.id}
                className={`flex items-center gap-3 rounded-lg px-2 py-2 transition-colors ${
                  isDone ? 'opacity-60' : 'hover:bg-surface-1'
                }`}
              >
                <button
                  type='button'
                  onClick={e => {
                    e.stopPropagation();
                    toggleItem(item.id);
                  }}
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
                    isDone
                      ? 'border-[var(--linear-accent)] bg-[var(--linear-accent)]'
                      : 'border-subtle hover:border-secondary-token'
                  }`}
                  aria-label={
                    isDone
                      ? `Unmark ${item.label}`
                      : `Mark ${item.label} as done`
                  }
                >
                  {isDone ? (
                    <Check className='h-3 w-3 text-white' aria-hidden='true' />
                  ) : null}
                </button>

                <Link
                  href={item.href}
                  className='flex min-w-0 flex-1 items-center gap-3'
                >
                  <item.icon
                    className='h-4 w-4 flex-shrink-0 text-tertiary-token'
                    aria-hidden='true'
                  />
                  <div className='min-w-0 flex-1'>
                    <p className='text-[13px] font-[450] text-primary-token'>
                      {item.label}
                    </p>
                    <p className='text-[11px] text-tertiary-token'>
                      {item.description}
                    </p>
                  </div>
                </Link>
              </li>
            );
          }

          return content;
        })}
      </ul>
    </ContentSurfaceCard>
  );
}
