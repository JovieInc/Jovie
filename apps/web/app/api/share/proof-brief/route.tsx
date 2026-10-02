import { ImageResponse } from 'next/og';
import { type NextRequest, NextResponse } from 'next/server';
import { ProofBriefError } from '@/lib/proof-briefs/contract';
import {
  PROOF_BRIEF_CARD_SIZE,
  ProofBriefCard,
} from '@/lib/proof-briefs/image';
import { resolveCertifiedProofBrief } from '@/lib/proof-briefs/resolve';
import { loadShareFonts } from '@/lib/share/image-utils';

export const runtime = 'nodejs';

const briefIdSchema = /^[a-zA-Z0-9_-]{1,64}$/;

export async function GET(req: NextRequest) {
  const briefId = req.nextUrl.searchParams.get('brief');
  const revParam = req.nextUrl.searchParams.get('rev');

  if (!briefId || !briefIdSchema.test(briefId)) {
    return NextResponse.json(
      { error: 'Invalid brief.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const revision = revParam != null ? Number.parseInt(revParam, 10) : undefined;
  const brief = resolveCertifiedProofBrief(
    briefId,
    Number.isFinite(revision) ? revision : undefined
  );
  if (!brief) {
    return NextResponse.json(
      { error: 'Brief not found.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let fonts: Awaited<ReturnType<typeof loadShareFonts>>;
  try {
    fonts = await loadShareFonts();
  } catch {
    return NextResponse.json(
      { error: 'Font loading failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    return new ImageResponse(<ProofBriefCard brief={brief} />, {
      ...PROOF_BRIEF_CARD_SIZE,
      fonts: [
        {
          name: 'Satoshi',
          data: fonts.satoshi,
          weight: 700,
          style: 'normal',
        },
      ],
      headers: { 'Cache-Control': 'public, max-age=86400, immutable' },
    });
  } catch (error) {
    const status =
      error instanceof ProofBriefError && error.code === 'privacy-scope'
        ? 403
        : error instanceof ProofBriefError && error.code === 'stale-brief'
          ? 410
          : 400;
    return NextResponse.json(
      { error: 'Brief not renderable.' },
      { status, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
