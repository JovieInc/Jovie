import { NextResponse } from 'next/server';
import {
  DESKTOP_RELEASES_HTML_URL,
  fetchLatestDesktopRelease,
} from '@/lib/desktop/github-releases';

export const dynamic = 'force-dynamic';

export async function GET() {
  const release = await fetchLatestDesktopRelease();
  if (release?.mac?.url) {
    return NextResponse.redirect(release.mac.url, 302);
  }
  return NextResponse.redirect(DESKTOP_RELEASES_HTML_URL, 302);
}
