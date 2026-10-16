import { NextResponse } from 'next/server';
import {
  DESKTOP_RELEASES_HTML_URL,
  fetchLatestDesktopRelease,
} from '@/lib/desktop/github-releases';
import { MAC_APP_SUPPORT } from '@/lib/desktop/mac-compatibility';

export const dynamic = 'force-dynamic';

export async function GET(request?: Request) {
  const release = await fetchLatestDesktopRelease();
  if (
    request &&
    new URL(request.url).searchParams.get('format') === 'capabilities'
  ) {
    return NextResponse.json(
      {
        ...MAC_APP_SUPPORT,
        // An empty/missing artifact (including a stale cached release) is not
        // evidence that the supported Mac app has been withdrawn. This provider
        // can confirm availability, but cannot authoritatively deny it.
        available: release?.mac ? true : null,
      },
      { status: release?.mac ? 200 : 503 }
    );
  }
  if (release?.mac?.url) {
    return NextResponse.redirect(release.mac.url, 302);
  }
  return NextResponse.redirect(DESKTOP_RELEASES_HTML_URL, 302);
}
