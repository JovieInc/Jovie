import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { CopyFloorViolationError } from '@/lib/copy/outbound-floor';
import { getOwnedProfile } from '@/lib/dsp-bio-sync/ownership';
import {
  DSP_BIO_PROVIDERS,
  getEnabledBioProviders,
} from '@/lib/dsp-bio-sync/providers';
import { approveBioSync, syncBioToDsps } from '@/lib/dsp-bio-sync/service';
import { captureError } from '@/lib/error-tracking';

// ============================================================================
// Request Schema
// ============================================================================

const bioSyncRequestSchema = z.union([
  z.strictObject({
    action: z.literal('propose').optional(),
    profileId: z.string().uuid(),
    /** Optional: specific destinations to preview. */
    providerIds: z.array(z.string().min(1)).min(1).max(7).optional(),
    /** Optional: override bio text. If omitted, uses the current bio from the profile. */
    bioText: z
      .string()
      .min(1, 'Bio text cannot be empty')
      .max(5000, 'Bio text is too long (max 5000 characters)')
      .optional(),
  }),
  z.strictObject({
    action: z.literal('approve'),
    profileId: z.string().uuid(),
    providerId: z.string().min(1),
    proposalId: z.string().uuid(),
    confirmation: z.string().regex(/^[a-f0-9]{64}$/),
  }),
]);

// ============================================================================
// POST Handler - Trigger bio sync
// ============================================================================

export async function POST(request: Request) {
  try {
    // Authenticate user
    const { userId } = await getCachedAuth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const parsed = bioSyncRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { profileId } = parsed.data;

    // Verify user owns this profile
    const ownership = await getOwnedProfile(profileId, userId);
    if (ownership.status === 'not_found') {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    if (ownership.status === 'forbidden') {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to modify this profile',
        },
        { status: 403 }
      );
    }

    const profile = ownership.profile;
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    if (parsed.data.action === 'approve') {
      const receipt = await approveBioSync({
        userId,
        creatorProfileId: profileId,
        providerId: parsed.data.providerId,
        proposalId: parsed.data.proposalId,
        confirmation: parsed.data.confirmation,
      });
      return NextResponse.json({
        success: receipt.result === 'submitted',
        receipt,
      });
    }

    const { providerIds, bioText } = parsed.data;
    // Ensure there's a bio to preview
    const effectiveBio = bioText ?? profile.bio;
    if (!effectiveBio?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'No bio text to sync. Please set a bio on your profile first.',
        },
        { status: 400 }
      );
    }

    // Persist previews only; explicit approval is a separate request.
    const result = await syncBioToDsps({
      userId,
      creatorProfileId: profileId,
      providerIds,
      bioText,
    });

    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof CopyFloorViolationError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          rules: error.rules,
        },
        { status: 400 }
      );
    }

    if (
      error instanceof Error &&
      [
        'already-approved',
        'approval-required',
        'confirmed-target-required',
        'confirmation-mismatch',
        'stale-proposal',
        'unauthorized-destination',
        'unverified-manifest',
      ].includes(error.message)
    )
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 }
      );
    if (error instanceof Error && error.message === 'invalid-submission-bio')
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );

    await captureError('DSP Bio Sync failed', error, {
      route: '/api/dsp/bio-sync',
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET Handler - List supported providers
// ============================================================================

export async function GET() {
  try {
    const providers = Object.entries(DSP_BIO_PROVIDERS).map(
      ([id, provider]) => ({ id, ...provider })
    );
    const enabledCount = getEnabledBioProviders().length;
    return NextResponse.json({ success: true, providers, enabledCount });
  } catch (error) {
    await captureError('DSP Bio Sync providers list failed', error, {
      route: '/api/dsp/bio-sync',
    });

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
