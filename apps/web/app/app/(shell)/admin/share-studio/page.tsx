import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { AdminToolPage } from '@/components/features/admin/layout/AdminToolPage';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { getBlogPosts } from '@/lib/blog/getBlogPosts';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { joviePlaylists } from '@/lib/db/schema/playlists';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  getProfileByUsername,
  getTopProfilesForStaticGeneration,
} from '@/lib/services/profile';
import {
  buildBlogShareContext,
  buildPlaylistShareContext,
  buildProfileShareContext,
  buildReleaseShareContext,
} from '@/lib/share/context';
import {
  buildDisplayUrl,
  buildMailtoHref,
  buildTrackedShareUrl,
} from '@/lib/share/copy';
import type { ShareContext } from '@/lib/share/types';

export const metadata: Metadata = {
  title: 'Share Studio | Admin',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ShareStudioPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface ProfileSample {
  readonly username: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly bio: string | null;
}

interface ReleaseSample {
  readonly username: string;
  readonly artistName: string;
  readonly slug: string;
  readonly title: string;
  readonly artworkUrl: string | null;
}

interface PlaylistSample {
  readonly slug: string;
  readonly title: string;
  readonly coverImageUrl: string | null;
  readonly editorialNote: string | null;
}

function getParamValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return null;
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
    readonly items: readonly { key: string; label: string }[];
    readonly selectedKey: string;
    readonly paramKey: string;
    readonly searchParams: URLSearchParams;
  }>
) {
  return (
    <ContentSurfaceCard className='space-y-2.5 rounded-xl p-3.5'>
      <p className='text-xs font-semibold text-primary-token'>{props.label}</p>
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
    <ContentSurfaceCard className='space-y-4 rounded-[14px] p-4'>
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
          <PayloadBlock label='Threads Fallback' value={threadsFallbackText} />
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
    </ContentSurfaceCard>
  );
}

function PayloadBlock(props: Readonly<{ label: string; value: string }>) {
  return (
    <div className='space-y-1.5'>
      <p className='text-xs font-semibold text-primary-token'>{props.label}</p>
      <pre className='overflow-x-auto rounded-xl border border-subtle bg-surface-0 px-3 py-2 text-2xs leading-[1.5] text-secondary-token whitespace-pre-wrap'>
        {props.value}
      </pre>
    </div>
  );
}

async function getProfileSamples(limit = 4): Promise<ProfileSample[]> {
  const usernames = await getTopProfilesForStaticGeneration(limit);
  const profiles = await Promise.all(
    usernames.map(async entry => getProfileByUsername(entry.username))
  );

  return profiles
    .filter((profile): profile is NonNullable<typeof profile> =>
      Boolean(profile?.usernameNormalized && profile.isPublic)
    )
    .map(profile => ({
      username: profile.usernameNormalized,
      name: profile.displayName ?? profile.username,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
    }));
}

async function getReleaseSamples(limit = 4): Promise<ReleaseSample[]> {
  return db
    .select({
      username: creatorProfiles.usernameNormalized,
      artistName: creatorProfiles.displayName,
      fallbackArtistName: creatorProfiles.username,
      slug: discogReleases.slug,
      title: discogReleases.title,
      artworkUrl: discogReleases.artworkUrl,
    })
    .from(discogReleases)
    .innerJoin(
      creatorProfiles,
      eq(discogReleases.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(eq(creatorProfiles.isPublic, true), isNull(discogReleases.deletedAt))
    )
    .orderBy(desc(discogReleases.releaseDate), desc(discogReleases.createdAt))
    .limit(limit)
    .then(rows =>
      rows.map(row => ({
        username: row.username,
        artistName: row.artistName ?? row.fallbackArtistName,
        slug: row.slug,
        title: row.title,
        artworkUrl: row.artworkUrl,
      }))
    );
}

async function getPlaylistSamples(limit = 4): Promise<PlaylistSample[]> {
  return db
    .select({
      slug: joviePlaylists.slug,
      title: joviePlaylists.title,
      coverImageUrl: joviePlaylists.coverImageUrl,
      editorialNote: joviePlaylists.editorialNote,
    })
    .from(joviePlaylists)
    .where(eq(joviePlaylists.status, 'published'))
    .orderBy(desc(joviePlaylists.publishedAt), desc(joviePlaylists.createdAt))
    .limit(limit);
}

export default async function AdminShareStudioPage({
  searchParams,
}: ShareStudioPageProps) {
  const params = await searchParams;
  const urlSearchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const normalizedValue = getParamValue(value);
    if (normalizedValue) {
      urlSearchParams.set(key, normalizedValue);
    }
  }

  const [blogPosts, profileSamples, releaseSamples, playlistSamples] =
    await Promise.all([
      getBlogPosts(),
      getProfileSamples(),
      getReleaseSamples(),
      getPlaylistSamples(),
    ]);

  const selectedBlog =
    blogPosts.find(post => post.slug === getParamValue(params.blog)) ??
    blogPosts[0];
  const selectedProfile =
    profileSamples.find(
      profile => profile.username === getParamValue(params.profile)
    ) ?? profileSamples[0];
  const selectedRelease =
    releaseSamples.find(
      release =>
        `${release.username}:${release.slug}` === getParamValue(params.release)
    ) ?? releaseSamples[0];
  const selectedPlaylist =
    playlistSamples.find(
      playlist => playlist.slug === getParamValue(params.playlist)
    ) ?? playlistSamples[0];

  if (
    !selectedBlog ||
    !selectedProfile ||
    !selectedRelease ||
    !selectedPlaylist
  ) {
    return (
      <AdminToolPage
        title='Share Studio'
        description='Preview share payloads once blog, profile, release, and playlist content exists.'
        testId='admin-share-studio-page'
      >
        <ContentSurfaceCard className='rounded-[14px] p-5 text-app text-secondary-token'>
          Share Studio needs at least one real blog post, public profile,
          release, and published playlist to render previews.
        </ContentSurfaceCard>
      </AdminToolPage>
    );
  }

  const blogContext = buildBlogShareContext({
    slug: selectedBlog.slug,
    title: selectedBlog.title,
    excerpt: selectedBlog.excerpt,
  });
  const profileContext = buildProfileShareContext({
    username: selectedProfile.username,
    artistName: selectedProfile.name,
    avatarUrl: selectedProfile.avatarUrl,
    bio: selectedProfile.bio,
  });
  const releaseContext = buildReleaseShareContext({
    username: selectedRelease.username,
    slug: selectedRelease.slug,
    title: selectedRelease.title,
    artistName: selectedRelease.artistName,
    artworkUrl: selectedRelease.artworkUrl,
    pathname: `/${selectedRelease.username}/${selectedRelease.slug}`,
  });
  const playlistContext = buildPlaylistShareContext({
    slug: selectedPlaylist.slug,
    title: selectedPlaylist.title,
    coverImageUrl: selectedPlaylist.coverImageUrl,
    editorialNote: selectedPlaylist.editorialNote,
  });

  return (
    <AdminToolPage
      title='Share Studio'
      description='Preview public share payloads, download story assets, and inspect tracked-link outputs across all public surfaces.'
      testId='admin-share-studio-page'
    >
      <div className='grid gap-3 xl:grid-cols-2'>
        <SamplePicker
          label='Blog Sample'
          items={blogPosts.slice(0, 4).map(post => ({
            key: post.slug,
            label: post.title,
          }))}
          selectedKey={selectedBlog.slug}
          paramKey='blog'
          searchParams={urlSearchParams}
        />
        <SamplePicker
          label='Profile Sample'
          items={profileSamples.map(profile => ({
            key: profile.username,
            label: profile.name,
          }))}
          selectedKey={selectedProfile.username}
          paramKey='profile'
          searchParams={urlSearchParams}
        />
        <SamplePicker
          label='Release Sample'
          items={releaseSamples.map(release => ({
            key: `${release.username}:${release.slug}`,
            label: `${release.artistName} — ${release.title}`,
          }))}
          selectedKey={`${selectedRelease.username}:${selectedRelease.slug}`}
          paramKey='release'
          searchParams={urlSearchParams}
        />
        <SamplePicker
          label='Playlist Sample'
          items={playlistSamples.map(playlist => ({
            key: playlist.slug,
            label: playlist.title,
          }))}
          selectedKey={selectedPlaylist.slug}
          paramKey='playlist'
          searchParams={urlSearchParams}
        />
      </div>

      <div className='grid gap-4'>
        <PayloadCard title='Blog Share Payload' context={blogContext} />
        <PayloadCard title='Profile Share Payload' context={profileContext} />
        <PayloadCard title='Release Share Payload' context={releaseContext} />
        <PayloadCard title='Playlist Share Payload' context={playlistContext} />
      </div>
    </AdminToolPage>
  );
}
