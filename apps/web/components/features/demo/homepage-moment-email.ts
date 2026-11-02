import { HOMEPAGE_PROFILE_PREVIEW_ARTIST } from '@/features/home/homepage-profile-preview-fixture';
import { getReleaseDayNotificationHtml } from '@/lib/email/templates/release-day-notification';
import {
  HOMEPAGE_MOMENT_NEXT_RELEASE,
  HOMEPAGE_MOMENT_PROVIDERS,
} from './homepage-moment-fixtures';

/**
 * Removes the template's outer page gutter so the product shot crops to the
 * message card itself. Presentation only; the email content is untouched.
 */
const GUTTER_RESET =
  '<meta name="color-scheme" content="dark"><style>html,body{background:transparent!important}body>table>tbody>tr>td{padding:0!important}</style></head>';

/**
 * The release-day email as subscribers receive it: the shipped template's
 * HTML for Tim White's newest release. Server-only (the template signs
 * unsubscribe links), so the showcase page builds it and passes it down.
 */
export function buildHomepageMomentEmailHtml(): string {
  return getReleaseDayNotificationHtml({
    artistName: HOMEPAGE_PROFILE_PREVIEW_ARTIST.name,
    releaseTitle: HOMEPAGE_MOMENT_NEXT_RELEASE.title,
    artworkUrl: HOMEPAGE_MOMENT_NEXT_RELEASE.artworkUrl,
    username: HOMEPAGE_PROFILE_PREVIEW_ARTIST.handle,
    slug: HOMEPAGE_MOMENT_NEXT_RELEASE.slug,
    streamingLinks: HOMEPAGE_MOMENT_PROVIDERS.slice(0, 2).map(provider => ({
      providerId: provider.key,
      url: provider.url,
    })),
  }).replace('</head>', GUTTER_RESET);
}
