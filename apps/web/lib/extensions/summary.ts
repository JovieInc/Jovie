import type {
  ExtensionContextSummary,
  ExtensionDiscoverySuggestion,
  ExtensionEntitySummary,
  ExtensionPageKind,
  ExtensionPrimaryAction,
  ExtensionShellCopy,
  ExtensionSummaryResponse,
} from '@jovie/extension-contracts';
import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { getSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { socialLinks } from '@/lib/db/schema/links';
import { tourDates } from '@/lib/db/schema/tour';
import { getReleasesForProfile } from '@/lib/discography/queries';

type SupportedPage = {
  kind: ExtensionPageKind;
  label: string;
} | null;

function classifyPage(url: URL): SupportedPage {
  const host = url.hostname.toLowerCase();

  if (host === 'mail.google.com') {
    return { kind: 'email', label: 'Gmail' };
  }
  if (host === 'genius.com' || host.endsWith('.genius.com')) {
    return { kind: 'lyrics', label: 'Lyrics Page' };
  }
  if (
    host === 'eventbrite.com' ||
    host.endsWith('.eventbrite.com') ||
    host === 'bandsintown.com' ||
    host.endsWith('.bandsintown.com')
  ) {
    return { kind: 'tour', label: 'Tour Page' };
  }
  if (host === 'open.spotify.com' || host.endsWith('.spotify.com')) {
    return { kind: 'release', label: 'Spotify Page' };
  }
  if (host === 'artists.spotify.com') {
    return { kind: 'artist', label: 'Spotify for Artists' };
  }
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    return { kind: 'discovery', label: 'Instagram Page' };
  }

  return null;
}

function getShellCopy(
  status: ExtensionSummaryResponse['status'],
  pageKind: ExtensionPageKind,
  displayName: string
): ExtensionShellCopy {
  if (status === 'unsupported') {
    return {
      title: 'This Page Is Not Supported Yet',
      body: 'Jovie is ready to help when you open a supported music workflow page.',
    };
  }

  if (status === 'no_match') {
    return {
      title: 'Nothing Matched Yet',
      body: `Open a supported page for ${displayName}, or ask Jovie to pull up the right entity.`,
    };
  }

  const titles: Record<ExtensionPageKind, ExtensionShellCopy> = {
    unsupported: {
      title: 'Jovie Is Standing By',
      body: 'Open a supported page to see relevant entities and one-click actions.',
    },
    artist: {
      title: displayName,
      body: 'Profile context is ready for this page.',
    },
    release: {
      title: 'Release Context Is Ready',
      body: `Jovie pulled your latest release context for ${displayName}.`,
    },
    lyrics: {
      title: 'Lyrics Context Is Ready',
      body: 'Sync lyrics, copy metadata, or insert fields from the right release.',
    },
    tour: {
      title: 'Tour Context Is Ready',
      body: 'Upcoming dates and venue details are ready for one-click actions.',
    },
    email: {
      title: 'Pitch Context Is Ready',
      body: 'Insert artist, release, and link details without leaving the compose flow.',
    },
    discovery: {
      title: 'Discovery Context Is Ready',
      body: 'Jovie can help you connect missing profile links from this page.',
    },
  };

  return titles[pageKind];
}

function buildContext(
  url: URL,
  title: string | null,
  supportedPage: SupportedPage
): ExtensionContextSummary {
  return {
    pageKind: supportedPage?.kind ?? 'unsupported',
    host: url.hostname,
    url: url.toString(),
    title,
    statusLabel: supportedPage?.label ?? 'Unsupported Page',
  };
}

function buildPrimaryAction(
  pageKind: ExtensionPageKind,
  entityKind: ExtensionEntitySummary['kind']
): ExtensionPrimaryAction {
  if (pageKind === 'lyrics') {
    return {
      kind: 'sync',
      label: entityKind === 'release' ? 'Sync Lyrics' : 'Open',
    };
  }

  if (pageKind === 'tour') {
    return {
      kind: entityKind === 'tourDate' ? 'insert' : 'open',
      label: entityKind === 'tourDate' ? 'Insert' : 'Open',
    };
  }

  if (pageKind === 'artist' || pageKind === 'discovery') {
    return {
      kind: entityKind === 'profile' ? 'sync' : 'open',
      label: entityKind === 'profile' ? 'Sync' : 'Open',
    };
  }

  return {
    kind: 'insert',
    label: 'Insert',
  };
}

function formatDisplayDate(value: Date | string | null | undefined): string {
  if (!value) return 'No Date';

  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'No Date';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function hasPlatformLink(
  links: readonly { platform: string }[],
  platform: string
): boolean {
  return links.some(link => link.platform.toLowerCase() === platform);
}

export async function buildExtensionSummary(params: {
  pageUrl: string;
  pageTitle: string | null;
}): Promise<ExtensionSummaryResponse> {
  const url = new URL(params.pageUrl);
  const supportedPage = classifyPage(url);
  const session = await getSessionContext({ requireProfile: true });
  const profile = session.profile;

  if (!profile) {
    throw new Error('Profile not found');
  }

  const displayName =
    profile.displayName ??
    profile.username ??
    profile.usernameNormalized ??
    'Jovie';

  const context = buildContext(url, params.pageTitle, supportedPage);

  if (!supportedPage) {
    return {
      status: 'unsupported',
      context,
      shellCopy: getShellCopy('unsupported', 'unsupported', displayName),
      suggestion: null,
      entities: [],
      discoverySuggestions: [],
    };
  }

  const [releases, upcomingTourDates, activeLinks] = await Promise.all([
    getReleasesForProfile(profile.id),
    db
      .select({
        id: tourDates.id,
        title: tourDates.title,
        startDate: tourDates.startDate,
        venueName: tourDates.venueName,
        city: tourDates.city,
        region: tourDates.region,
        country: tourDates.country,
        ticketUrl: tourDates.ticketUrl,
      })
      .from(tourDates)
      .where(
        and(
          eq(tourDates.profileId, profile.id),
          gte(tourDates.startDate, new Date())
        )
      )
      .orderBy(asc(tourDates.startDate))
      .limit(5),
    db
      .select({
        id: socialLinks.id,
        platform: socialLinks.platform,
        url: socialLinks.url,
      })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, profile.id),
          eq(socialLinks.state, 'active')
        )
      )
      .orderBy(desc(socialLinks.updatedAt))
      .limit(12),
  ]);

  const releaseEntities: ExtensionEntitySummary[] = releases
    .slice(0, 5)
    .map(release => ({
      id: release.id,
      kind: 'release',
      title: release.title,
      subtitle: release.artistNames?.join(', ') ?? displayName,
      imageUrl: release.artworkUrl ?? null,
      metadataLine: formatDisplayDate(release.releaseDate),
      primaryAction: buildPrimaryAction(supportedPage.kind, 'release'),
      fields: [
        {
          id: 'release-title',
          label: 'Release Title',
          value: release.title,
          actions: ['copy', 'insert'],
        },
        {
          id: 'release-date',
          label: 'Release Date',
          value: formatDisplayDate(release.releaseDate),
          actions: ['copy', 'insert'],
        },
        ...(release.trackSummary?.primaryIsrc
          ? [
              {
                id: 'primary-isrc',
                label: 'Primary ISRC',
                value: release.trackSummary.primaryIsrc,
                actions: ['copy', 'insert'] as const,
              },
            ]
          : []),
      ],
    }));

  const profileEntity: ExtensionEntitySummary = {
    id: profile.id,
    kind: 'profile',
    title: displayName,
    subtitle: profile.username ? `@${profile.username}` : null,
    imageUrl: profile.avatarUrl ?? null,
    metadataLine: activeLinks.length
      ? `${activeLinks.length} Active Links`
      : 'Artist Profile',
    primaryAction: buildPrimaryAction(supportedPage.kind, 'profile'),
    fields: [
      {
        id: 'display-name',
        label: 'Display Name',
        value: displayName,
        actions: ['copy', 'insert'],
      },
      ...(profile.username
        ? [
            {
              id: 'username',
              label: 'Username',
              value: `@${profile.username}`,
              actions: ['copy', 'insert'] as const,
            },
          ]
        : []),
    ],
  };

  const tourEntities: ExtensionEntitySummary[] = upcomingTourDates.map(
    date => ({
      id: date.id,
      kind: 'tourDate',
      title: date.title ?? date.venueName,
      subtitle: [date.city, date.region, date.country]
        .filter(Boolean)
        .join(', '),
      imageUrl: null,
      metadataLine: formatDisplayDate(date.startDate),
      primaryAction: buildPrimaryAction(supportedPage.kind, 'tourDate'),
      fields: [
        {
          id: 'venue-name',
          label: 'Venue',
          value: date.venueName,
          actions: ['copy', 'insert'],
        },
        {
          id: 'event-date',
          label: 'Date',
          value: formatDisplayDate(date.startDate),
          actions: ['copy', 'insert'],
        },
        ...(date.ticketUrl
          ? [
              {
                id: 'ticket-url',
                label: 'Ticket URL',
                value: date.ticketUrl,
                actions: ['copy', 'insert'] as const,
              },
            ]
          : []),
      ],
    })
  );

  const orderedEntities: ExtensionEntitySummary[] = (() => {
    if (supportedPage.kind === 'tour') {
      return [...tourEntities, ...releaseEntities, profileEntity];
    }
    if (
      supportedPage.kind === 'release' ||
      supportedPage.kind === 'lyrics' ||
      supportedPage.kind === 'email'
    ) {
      return [...releaseEntities, profileEntity, ...tourEntities];
    }
    return [profileEntity, ...releaseEntities, ...tourEntities];
  })();

  const discoverySuggestions: ExtensionDiscoverySuggestion[] = [];

  if (
    supportedPage.kind === 'discovery' &&
    !hasPlatformLink(activeLinks, 'instagram')
  ) {
    discoverySuggestions.push({
      id: 'instagram-link',
      title: 'Add This Instagram',
      body: 'Jovie can connect this Instagram profile to your artist identity.',
      actionLabel: 'Add Link',
    });
  }

  if (
    supportedPage.kind === 'release' &&
    !hasPlatformLink(activeLinks, 'spotify')
  ) {
    discoverySuggestions.push({
      id: 'spotify-link',
      title: 'Add This Spotify Profile',
      body: 'We found a Spotify surface that is not connected to your profile yet.',
      actionLabel: 'Review Link',
    });
  }

  const suggestion = orderedEntities[0] ?? null;

  if (!suggestion) {
    return {
      status: 'no_match',
      context,
      shellCopy: getShellCopy('no_match', supportedPage.kind, displayName),
      suggestion: null,
      entities: [],
      discoverySuggestions,
    };
  }

  return {
    status: 'ready',
    context,
    shellCopy: getShellCopy('ready', supportedPage.kind, displayName),
    suggestion,
    entities: orderedEntities,
    discoverySuggestions,
  };
}
