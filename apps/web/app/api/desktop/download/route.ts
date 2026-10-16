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
        available: release ? Boolean(release.mac?.url) : null,
      },
      { status: release ? 200 : 503 }
    );
  }
  if (release?.mac?.url) {
    return NextResponse.redirect(release.mac.url, 302);
  }
  return NextResponse.redirect(DESKTOP_RELEASES_HTML_URL, 302);
}
