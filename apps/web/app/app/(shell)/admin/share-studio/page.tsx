import { CardContent, CardHeader } from '@jovie/ui';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { PageErrorState } from '@/components/features/feedback/PageErrorState';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import {
  buildDisplayUrl,
  buildMailtoHref,
  buildTrackedShareUrl,
} from '@/lib/share/copy';
import type { ShareContext } from '@/lib/share/types';
import {
  loadShareStudioData,
  type SamplePickerItem,
  type ShareStudioSearchParams,
  type ShareStudioType,
} from './loader';

export const metadata: Metadata = {
  title: 'Share Studio | Admin',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ShareStudioPageProps {
  readonly searchParams: Promise<ShareStudioSearchParams>;
}

function buildPickerHref(
  params: URLSearchParams,
  key: string,
  value: string
): string {
  const nextParams = new URLSearchParams(params);
  nextParams.set(key, value);
  return `${APP_ROUTES.ADMIN_SHARE_STUDIO}?${nextParams.toString()}`;
}

function buildTwitterIntentUrl(context: ShareContext): string {
  const searchParams = new URLSearchParams({
    text: context.preparedText,
    url: buildTrackedShareUrl(context, {
      utm_source: 'twitter',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'post',
    }),
  });

  return `https://twitter.com/intent/tweet?${searchParams.toString()}`;
}

function buildThreadsFallbackText(context: ShareContext): string {
  return `${context.preparedText}\n${buildTrackedShareUrl(context, {
    utm_source: 'threads',
    utm_medium: 'social',
    utm_campaign: '{{release_slug}}',
    utm_content: 'post',
  })}`;
}

function buildTrackedPreviewLinks(context: ShareContext) {
  return [
    {
      label: 'Instagram Story',
      url: buildTrackedShareUrl(context, {
        utm_source: 'instagram',
        utm_medium: 'social',
        utm_campaign: '{{release_slug}}',
        utm_content: 'story',
      }),
    },
    {
      label: 'Newsletter',
      url: buildTrackedShareUrl(context, {
        utm_source: 'newsletter',
        utm_medium: 'email',
        utm_campaign: '{{release_slug}}',
        utm_content: 'feature',
      }),
    },
    {
      label: 'QR Code',
      url: buildTrackedShareUrl(context, {
        utm_source: 'qr_code',
        utm_medium: 'offline',
        utm_campaign: '{{release_slug}}',
        utm_content: 'print',
      }),
    },
  ];
}

function SamplePicker(
  props: Readonly<{
    readonly label: string;
    readonly items: readonly SamplePickerItem[];
    readonly selectedKey: string;
    readonly paramKey: string;
    readonly searchParams: URLSearchParams;
  }>
) {
  return (
    <ContentSurfaceCard>
      <CardHeader>
        <p className='text-xs font-semibold text-primary-token'>
          {props.label}
        </p>
      </CardHeader>
      <CardContent>
        <div className='flex flex-wrap gap-2'>
          {props.items.map(item => {
            const isSelected = item.key === props.selectedKey;

            return (
              <Link
                key={item.key}
                href={buildPickerHref(
                  props.searchParams,
                  props.paramKey,
                  item.key
                )}
                aria-current={isSelected ? 'true' : undefined}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  isSelected
                    ? 'border-primary-token bg-primary-token/10 text-primary-token'
                    : 'border-subtle text-secondary-token hover:text-primary-token'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </CardContent>
    </ContentSurfaceCard>
  );
}

function PayloadCard(
  props: Readonly<{
    readonly title: string;
    readonly context: ShareContext;
  }>
) {
  const twitterIntentUrl = buildTwitterIntentUrl(props.context);
  const threadsFallbackText = buildThreadsFallbackText(props.context);
  const mailtoHref = buildMailtoHref({
    subject: props.context.emailSubject,
    body: `${props.context.preparedText}\n\n${buildTrackedShareUrl(
      props.context,
      {
        utm_source: 'email',
        utm_medium: 'share',
        utm_campaign: '{{release_slug}}',
        utm_content: 'friend',
      }
    )}`,
  });

  return (
    <ContentSurfaceCard>
      <CardHeader>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <p className='text-sm font-semibold text-primary-token'>
              {props.title}
            </p>
            <p className='text-xs text-secondary-token'>
              {buildDisplayUrl(new URL(props.context.canonicalUrl).pathname)}
            </p>
          </div>
          <a
            href={props.context.asset.url}
            download={props.context.asset.fileName}
            className='text-xs text-secondary-token hover:text-primary-token'
          >
            Download Asset
          </a>
        </div>
      </CardHeader>
      <CardContent>
        <div className='grid gap-4 lg:grid-cols-[320px_1fr]'>
          <div className='space-y-3'>
            <Image
              src={props.context.asset.url}
              alt={`${props.context.title} story preview`}
              className='aspect-[9/16] w-full rounded-xl border border-subtle object-cover'
              width={1080}
              height={1920}
            />
            <p className='text-xs leading-[18px] text-secondary-token'>
              Instagram fallback: download the story asset, copy the tracked
              canonical link, then add both manually in Stories when native file
              share is unavailable.
            </p>
          </div>

          <div className='grid gap-3'>
            <PayloadBlock
              label='Prepared Text'
              value={props.context.preparedText}
            />
            <PayloadBlock label='X Intent URL' value={twitterIntentUrl} />
            <PayloadBlock
              label='Threads Fallback'
              value={threadsFallbackText}
            />
            <PayloadBlock
              label='Email Subject'
              value={props.context.emailSubject}
            />
            <PayloadBlock label='Email Body' value={props.context.emailBody} />
            <PayloadBlock label='Mailto' value={mailtoHref} />
            <PayloadBlock
              label='Tracked Link Outputs'
              value={buildTrackedPreviewLinks(props.context)
                .map(link => `${link.label}: ${link.url}`)
                .join('\n\n')}
            />
          </div>
        </div>
      </CardContent>
    </ContentSurfaceCard>
  );
}

function PayloadBlock(props: Readonly<{ label: string; value: string }>) {
  return (
    <div className='space-y-1.5'>
      <p className='text-xs font-semibold text-primary-token'>{props.label}</p>
      <pre className='overflow-x-auto rounded-xl border border-subtle bg-surface-0 px-3 py-2 text-2xs leading-normal text-secondary-token whitespace-pre-wrap'>
        {props.value}
      </pre>
    </div>
  );
}

const PREVIEW_TYPES = [
  { type: 'blog', label: 'Blog' },
  { type: 'profile', label: 'Profile' },
  { type: 'release', label: 'Release' },
  { type: 'playlist', label: 'Playlist' },
] as const;

async function SharePreview({
  type,
  label,
  params,
}: {
  readonly type: ShareStudioType;
  readonly label: string;
  readonly params: ShareStudioSearchParams;
}) {
  const data = await loadShareStudioData(params, type);
  if (data.state === 'unavailable') {
    return (
      <PageErrorState
        title={`${label} preview unavailable`}
        message={`The public ${type} catalog could not be read. Other previews are independent.`}
        actionLabel={`Retry ${type} preview`}
      />
    );
  }
  if (!data.context) {
    return (
      <ContentSurfaceCard>
        <CardHeader>
          <p>
            No public {type} sample is available. Other previews are
            independent.
          </p>
        </CardHeader>
      </ContentSurfaceCard>
    );
  }
  return (
    <div className='space-y-3'>
      <SamplePicker
        label={`${label} Sample`}
        items={data.items}
        selectedKey={data.selectedKey}
        paramKey={type}
        searchParams={data.urlSearchParams}
      />
      <Link
        href={data.context.canonicalUrl}
        className='text-sm text-secondary-token underline'
      >
        Open selected {type}
      </Link>
      <PayloadCard title={`${label} Share Payload`} context={data.context} />
    </div>
  );
}

export default async function AdminShareStudioPage({
  searchParams,
}: ShareStudioPageProps) {
  await requireCurrentAdminPageAccess();
  const params = await searchParams;
  return (
    <AdminPage
      title='Share Studio'
      description='Preview public share payloads, download story assets, and inspect tracked-link outputs across all public surfaces.'
      testId='admin-share-studio-page'
    >
      <div className='grid gap-4'>
        {PREVIEW_TYPES.map(({ type, label }) => (
          <section key={type} aria-label={`${label} share preview`}>
            <Suspense
              key={String(params[type] ?? '')}
              fallback={
                <ContentSurfaceCard>
                  <CardHeader>
                    <p role='status'>Loading {type} preview…</p>
                  </CardHeader>
                </ContentSurfaceCard>
              }
            >
              <SharePreview type={type} label={label} params={params} />
            </Suspense>
          </section>
        ))}
      </div>
    </AdminPage>
  );
}
