import { NextResponse } from 'next/server';
import { readArtistIdentityQuality } from '@/lib/music-resolver/artist-identity-confidence.server';
import { musicResolverCutoverReceipt } from '@/lib/music-resolver/musicfetch-gate';
import { readShadowParitySummary } from '@/lib/music-resolver/resolve-parity.server';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' } as const;

/**
 * Resolver match quality for Summer (JOV-7323): per-family shadow parity with
 * the false-link alarm, right-artist confidence across claimed profiles, and
 * the deployed cutover/rollback configuration. Admin-only, never cached;
 * empty denominators report null, never a certified zero.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const principal = await resolveOviePrincipal(request).catch(() => null);
  if (!principal) {
    return NextResponse.json(
      { error: 'music_resolver_metrics_unavailable' },
      { status: 503, headers }
    );
  }
  const gate = authorizeSummerControl(principal);
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'forbidden' },
      { status: gate.status, headers }
    );
  }
  try {
    const [parity, artistIdentity] = await Promise.all([
      readShadowParitySummary(),
      readArtistIdentityQuality(),
    ]);
    return NextResponse.json(
      {
        schema: 'jovie.music-resolver-quality/v1',
        parity,
        artistIdentity,
        cutover: musicResolverCutoverReceipt(),
      },
      { headers }
    );
  } catch {
    return NextResponse.json(
      { error: 'music_resolver_metrics_unavailable' },
      { status: 503, headers }
    );
  }
}
