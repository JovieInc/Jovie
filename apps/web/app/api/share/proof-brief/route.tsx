import { ImageResponse } from 'next/og';
import { type NextRequest, NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  assertProofBriefRenderable,
  ProofBriefError,
} from '@/lib/proof-briefs/contract';
import {
  PROOF_BRIEF_CARD_SIZE,
  ProofBriefCard,
} from '@/lib/proof-briefs/image';
import { resolveCertifiedProofBrief } from '@/lib/proof-briefs/resolve';
import { loadShareFonts } from '@/lib/share/image-utils';

export const runtime = 'nodejs';

const briefIdSchema = /^[a-zA-Z0-9_-]{1,64}$/;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const briefId = params.get('brief');
  const [revParam, duplicateRevision] = params.getAll('rev');
  const revision = revParam === undefined ? undefined : Number(revParam);
  if (
    !briefId ||
    !briefIdSchema.test(briefId) ||
    duplicateRevision !== undefined ||
    (revision !== undefined &&
      (!/^\d+$/.test(revParam) ||
        !Number.isSafeInteger(revision) ||
        revision < 1))
  ) {
    return NextResponse.json(
      { error: 'Invalid brief.' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const brief = resolveCertifiedProofBrief(briefId, revision);
  if (!brief) {
    return NextResponse.json(
      { error: 'Brief not found.' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  try {
    // ImageResponse renders lazily. Reject an ineligible snapshot before
    // scheduling image work, then finish rendering before returning a 200.
    assertProofBriefRenderable(brief, { requirePublic: true });
    const fonts = await loadShareFonts();
    const image = new ImageResponse(<ProofBriefCard brief={brief} />, {
      ...PROOF_BRIEF_CARD_SIZE,
      fonts: [
        {
          name: 'Satoshi',
          data: fonts.satoshi,
          weight: 700,
          style: 'normal',
        },
      ],
      headers: NO_STORE_HEADERS,
    });
    return new Response(await image.arrayBuffer(), { headers: image.headers });
  } catch (error) {
    const status =
      error instanceof ProofBriefError
        ? { 'privacy-scope': 403, 'stale-brief': 410, 'invalid-brief': 400 }[
            error.code
          ]
        : 500;
    return NextResponse.json(
      { error: 'Brief not renderable.' },
      { status, headers: NO_STORE_HEADERS }
    );
  }
}
