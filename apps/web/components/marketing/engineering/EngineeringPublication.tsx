import { Badge } from '@jovie/ui/atoms/badge';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MarketingContainer } from '@/components/marketing/MarketingContainer';
import { MarketingContentProse } from '@/components/marketing/MarketingContentProse';
import { MarketingHero } from '@/components/marketing/MarketingHero';
import { APP_ROUTES } from '@/constants/routes';
import type { EngineeringStoryRecord } from '@/lib/engineering-publication';

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function StoryMeta({
  record,
  preview,
}: {
  readonly record: EngineeringStoryRecord;
  readonly preview: boolean;
}) {
  const gateCount = record.issues.length;
  return (
    <div className='flex min-h-8 flex-wrap items-center gap-2'>
      <Badge variant='outline'>
        {record.source?.status === 'published' && record.issues.length === 0
          ? 'Published'
          : record.issues.length > 0
            ? 'Blocked'
            : 'Draft'}
      </Badge>
      {record.source ? (
        <Badge variant='outline'>
          {record.source.availability === 'public' ? 'Public' : 'Internal'}
        </Badge>
      ) : null}
      {record.source?.date ? (
        <time
          dateTime={record.source.date}
          className='text-xs tabular-nums text-tertiary-token'
        >
          {formatDate(record.source.date)}
        </time>
      ) : null}
      {preview ? (
        <span
          className='text-xs text-tertiary-token'
          data-testid='engineering-provenance'
        >
          {gateCount > 0
            ? `${gateCount} gate${gateCount === 1 ? '' : 's'} open`
            : 'Publish gates passed'}
        </span>
      ) : null}
    </div>
  );
}

function PageFrame({
  kicker,
  title,
  description,
  children,
}: {
  readonly kicker: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <section className='min-h-screen bg-page text-primary-token'>
      <MarketingHero variant='left'>
        <div className='text-sm font-medium text-tertiary-token'>{kicker}</div>
        <h1 className='system-b-marketing-route-title mb-4 mt-6 max-w-2xl text-primary-token line-clamp-2'>
          {title}
        </h1>
        <p className='mb-4 max-w-xl text-lg leading-relaxed text-secondary-token'>
          {description}
        </p>
      </MarketingHero>
      <MarketingContainer width='page' className='pb-20 sm:pb-28'>
        <div className='marketing-divider mb-10' />
        {children}
      </MarketingContainer>
    </section>
  );
}

export function EngineeringIndex({
  stories,
  preview = false,
}: {
  readonly stories: readonly EngineeringStoryRecord[];
  readonly preview?: boolean;
}) {
  const indexHref = preview
    ? APP_ROUTES.ENGINEERING_PREVIEW
    : APP_ROUTES.ENGINEERING;
  return (
    <PageFrame
      kicker={preview ? 'Founder preview' : 'Engineering'}
      title={preview ? 'Publication gallery' : 'Engineering'}
      description={
        preview
          ? 'Draft and provenance status for founder review. This gallery stays out of public indexes.'
          : 'Proof-led notes on what Jovie has shipped and made public.'
      }
    >
      <div data-testid='engineering-index'>
        {stories.length === 0 ? (
          <p className='text-secondary-token'>
            {preview
              ? 'No draft stories in the local founder gallery yet.'
              : 'No founder-approved engineering stories are public yet.'}
          </p>
        ) : (
          <ul className='space-y-8'>
            {stories.map(story => (
              <li key={story.slug}>
                <article className='space-y-3'>
                  <StoryMeta record={story} preview={preview} />
                  <h2 className='line-clamp-2 text-2xl font-semibold text-primary-token'>
                    <Link
                      href={`${indexHref}/${story.slug}`}
                      className='transition-colors hover:text-secondary-token'
                    >
                      {story.source?.title ?? story.slug}
                    </Link>
                  </h2>
                  <p className='max-w-2xl text-secondary-token'>
                    {story.source?.summary ??
                      'This source is blocked until the publication gates pass.'}
                  </p>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageFrame>
  );
}

export function EngineeringArticle({
  record,
  html,
  preview = false,
}: {
  readonly record: EngineeringStoryRecord;
  readonly html: string;
  readonly preview?: boolean;
}) {
  return (
    <PageFrame
      kicker={
        <Link
          href={
            preview ? APP_ROUTES.ENGINEERING_PREVIEW : APP_ROUTES.ENGINEERING
          }
          className='transition-colors hover:text-primary-token'
        >
          {preview ? 'Founder preview' : 'Engineering'}
        </Link>
      }
      title={record.source?.title ?? record.slug}
      description={
        record.source?.summary ??
        'This source is blocked until the publication gates pass.'
      }
    >
      <article data-testid='engineering-article'>
        <StoryMeta record={record} preview={preview} />
        <div className='mt-10'>
          <MarketingContentProse html={html} />
        </div>
        {record.source && record.source.evidence.length > 0 ? (
          <section aria-label='Evidence Receipts' className='mt-8 space-y-3'>
            <h2 className='line-clamp-1 text-sm font-medium text-primary-token'>
              Evidence
            </h2>
            <ul className='space-y-2'>
              {record.source.evidence.map(item => (
                <li key={item.id} className='text-sm text-secondary-token'>
                  <span className='mr-2 text-xs uppercase text-tertiary-token'>
                    {item.kind}
                  </span>
                  <a
                    href={item.href}
                    className='break-all text-primary-token underline-offset-4 hover:underline'
                  >
                    {item.href}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </PageFrame>
  );
}
