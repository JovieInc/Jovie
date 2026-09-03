'use client';

import { Button, Card } from '@jovie/ui';
import { Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { FEATURE_INTRO_CATALOG } from '../feature-intro-catalog';
import {
  FEATURE_INTRO_STORAGE,
  type FeatureIntroAccent,
  type FeatureIntroBullet,
  type FeatureIntroCatalog,
  type FeatureIntroKind,
  readFeatureIntroDismissal,
  resolveFeatureIntroPresentation,
  writeFeatureIntroDismissal,
} from '../feature-intro-contract';

const ACCENT_DOT_CLASS: Record<FeatureIntroAccent, string> = {
  accent: 'bg-accent',
  blue: 'bg-accent-blue',
  orange: 'bg-accent-orange',
};

export function FeatureIntroHost({
  catalog = FEATURE_INTRO_CATALOG,
  changelogHref = APP_ROUTES.CHANGELOG,
  onHighlightCTA,
}: {
  readonly catalog?: FeatureIntroCatalog;
  readonly changelogHref?: string;
  readonly onHighlightCTA: () => void;
}) {
  const [hasHydrated, setHasHydrated] = useState(false);
  const [dismissedHighlightID, setDismissedHighlightID] = useState('');
  const [dismissedWhatsNewID, setDismissedWhatsNewID] = useState('');

  useEffect(() => {
    setDismissedHighlightID(
      readFeatureIntroDismissal(FEATURE_INTRO_STORAGE.dismissedHighlightIDKey)
    );
    setDismissedWhatsNewID(
      readFeatureIntroDismissal(FEATURE_INTRO_STORAGE.dismissedWhatsNewIDKey)
    );
    setHasHydrated(true);
  }, []);

  if (!hasHydrated) return null;

  const presentation = resolveFeatureIntroPresentation({
    catalog,
    dismissedHighlightID,
    dismissedWhatsNewID,
  });
  if (!presentation) return null;

  const dismiss = () => {
    if (presentation.kind === 'highlight') {
      writeFeatureIntroDismissal(
        FEATURE_INTRO_STORAGE.dismissedHighlightIDKey,
        presentation.highlight.id
      );
      setDismissedHighlightID(presentation.highlight.id);
      return;
    }
    writeFeatureIntroDismissal(
      FEATURE_INTRO_STORAGE.dismissedWhatsNewIDKey,
      presentation.id
    );
    setDismissedWhatsNewID(presentation.id);
  };

  return (
    <div className='mb-3 w-full'>
      <FeatureIntroCard
        presentation={presentation}
        changelogHref={changelogHref}
        onDismiss={dismiss}
        onPrimaryCTA={onHighlightCTA}
      />
    </div>
  );
}

export function FeatureIntroCard({
  presentation,
  changelogHref,
  onDismiss,
  onPrimaryCTA,
}: {
  readonly presentation: FeatureIntroKind;
  readonly changelogHref: string;
  readonly onDismiss: () => void;
  readonly onPrimaryCTA: () => void;
}) {
  const label =
    presentation.kind === 'highlight'
      ? `${presentation.highlight.title}. ${presentation.highlight.oneLine}`
      : 'What’s New';

  return (
    <Card
      aria-label={label}
      className='p-4'
      data-testid='feature-intro-card'
      data-mode={presentation.kind}
      data-source-id={
        presentation.kind === 'highlight'
          ? presentation.highlight.id
          : presentation.id
      }
    >
      <div className='flex items-start gap-3'>
        {presentation.kind === 'highlight' ? (
          <>
            <span
              aria-hidden='true'
              className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-0 text-accent'
            >
              <Sparkles className='h-4 w-4' strokeWidth={2.25} />
            </span>
            <div className='min-w-0 flex-1'>
              <p className='text-sm font-semibold text-primary-token'>
                {presentation.highlight.title}
              </p>
              <p className='mt-1 text-sm text-tertiary-token'>
                {presentation.highlight.oneLine}
              </p>
            </div>
          </>
        ) : (
          <p className='min-w-0 flex-1 text-sm font-semibold text-primary-token'>
            What’s New
          </p>
        )}
        <Button
          aria-label='Dismiss'
          data-testid='feature-intro-dismiss'
          onClick={onDismiss}
          size='icon-sm'
          type='button'
          variant='ghost'
        >
          <X aria-hidden='true' className='h-3 w-3' strokeWidth={2.25} />
        </Button>
      </div>

      {presentation.kind === 'highlight' ? (
        <Button
          className='mt-4 w-full'
          data-testid='feature-intro-cta'
          onClick={onPrimaryCTA}
          size='sm'
          type='button'
          variant='primary'
        >
          {presentation.highlight.ctaTitle}
        </Button>
      ) : (
        <ul className='mt-4 flex list-none flex-col gap-2 p-0'>
          {presentation.rows.map(row =>
            row.kind === 'bullet' ? (
              <FeatureIntroBulletRow bullet={row.bullet} key={row.bullet.id} />
            ) : (
              <li className='flex items-baseline gap-3' key='and-more'>
                <span
                  aria-hidden='true'
                  className='h-2 w-2 shrink-0 rounded-full bg-tertiary-token'
                />
                <Button asChild variant='link'>
                  <Link
                    data-testid='feature-intro-and-more'
                    href={changelogHref}
                  >
                    And more
                  </Link>
                </Button>
              </li>
            )
          )}
        </ul>
      )}
    </Card>
  );
}

function FeatureIntroBulletRow({
  bullet,
}: {
  readonly bullet: FeatureIntroBullet;
}) {
  return (
    <li className='flex items-baseline gap-3'>
      <span
        aria-hidden='true'
        className={`h-2 w-2 shrink-0 rounded-full ${ACCENT_DOT_CLASS[bullet.accent]}`}
      />
      <span className='text-sm text-secondary-token'>{bullet.text}</span>
    </li>
  );
}
