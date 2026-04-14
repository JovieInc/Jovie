'use client';

import { Check } from 'lucide-react';
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
  label: string;
  description: string;
  href?: string;
  action?: 'copy-url';
}

const CHECKLIST_ITEM_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'set-up-tips': ['connect-venmo'],
};

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: 'share-instagram',
    label: 'Share your profile on Instagram',
    description: 'Post your link to your story or bio',
  },
  {
    id: 'spotify-bio',
    label: 'Add your Jovie link to your Spotify bio',
    description: 'Fans searching for you will find everything',
    action: 'copy-url',
  },
  {
    id: 'qr-code',
    label: 'Download a QR code for your next show',
    description: 'Print it for merch tables and venues',
  },
  {
    id: 'set-up-tips',
    label: 'Set Up Tips',
    description: 'Let fans support you directly',
    href: `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`,
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
    const stored = JSON.parse(raw) as string[];
    const normalized = new Set(stored);

    for (const [itemId, aliases] of Object.entries(CHECKLIST_ITEM_ALIASES)) {
      if (aliases.some(alias => normalized.has(alias))) {
        normalized.add(itemId);
      }
    }

    return normalized;
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
    <ContentSurfaceCard className='overflow-hidden p-0'>
      <div className='flex items-center justify-between gap-3 border-b border-(--linear-app-frame-seam) px-3 py-2'>
        <div className='flex items-center gap-1.5'>
          <h3 className='text-[12px] font-[510] tracking-[-0.01em] text-primary-token'>
            Get started
          </h3>
          <span className='text-[11px] text-tertiary-token'>
            {completedCount}/{CHECKLIST_ITEMS.length}
          </span>
        </div>
        <div className='flex items-center gap-2'>
          {profileUrl && (
            <a
              href={profileUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='text-[11px] text-secondary-token transition-colors hover:text-primary-token'
            >
              View profile
            </a>
          )}
          <button
            type='button'
            onClick={handleDismiss}
            className='rounded-full border border-transparent px-2 py-0.5 text-[11px] text-tertiary-token transition-colors hover:border-(--linear-app-frame-seam) hover:bg-surface-0 hover:text-secondary-token'
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className='mx-3 mt-2 h-1 rounded-full bg-surface-0'>
        <div
          className='h-1 rounded-full bg-[var(--linear-accent)] transition-all duration-300'
          style={{
            width: `${(completedCount / CHECKLIST_ITEMS.length) * 100}%`,
          }}
        />
      </div>

      <ul className='px-2 py-2'>
        {CHECKLIST_ITEMS.map(item => {
          const isDone = completed.has(item.id);

          const checkboxEl = (
            <button
              type='button'
              onClick={e => {
                e.stopPropagation();
                toggleItem(item.id);
              }}
              className={`flex h-4.5 w-4.5 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
                isDone
                  ? 'border-[var(--linear-accent)] bg-[var(--linear-accent)]'
                  : 'border-subtle bg-(--linear-app-content-surface) hover:border-secondary-token'
              }`}
              aria-label={
                isDone ? `Unmark ${item.label}` : `Mark ${item.label} as done`
              }
            >
              {isDone ? (
                <Check className='h-2.5 w-2.5 text-white' aria-hidden='true' />
              ) : null}
            </button>
          );

          const labelEl = (
            <p
              className={`min-w-0 flex-1 text-[12px] leading-snug ${isDone ? 'line-through text-tertiary-token' : 'text-secondary-token'}`}
            >
              {item.label}
            </p>
          );

          if (!isDone && item.href) {
            return (
              <li
                key={item.id}
                className='flex items-center gap-2 rounded-full border border-transparent px-2.5 py-1.5 hover:border-(--linear-app-frame-seam) hover:bg-surface-0'
              >
                {checkboxEl}
                <Link
                  href={item.href}
                  className='flex min-w-0 flex-1 items-center'
                >
                  {labelEl}
                </Link>
              </li>
            );
          }

          return (
            <li
              key={item.id}
              className={`flex items-center gap-2 rounded-full border border-transparent px-2.5 py-1.5 transition-colors ${
                isDone
                  ? 'bg-surface-0/70 opacity-50'
                  : 'hover:border-(--linear-app-frame-seam) hover:bg-surface-0'
              }`}
            >
              {checkboxEl}
              {labelEl}
              {!isDone && item.action === 'copy-url' && (
                <button
                  type='button'
                  onClick={e => {
                    e.stopPropagation();
                    handleCopyUrl();
                  }}
                  className='rounded-full border border-transparent px-2 py-0.5 text-[10px] text-tertiary-token transition-colors hover:border-(--linear-app-frame-seam) hover:bg-surface-1 hover:text-secondary-token'
                >
                  Copy
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </ContentSurfaceCard>
  );
}
