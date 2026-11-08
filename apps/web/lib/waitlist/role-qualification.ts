import { z } from 'zod';
import {
  type AdmissionScore,
  scoreAdmissionCandidate,
} from '@/lib/waitlist/admission-score';

/**
 * Qualify a request-access entrant at the door
 * (docs/ONBOARDING_QUALIFICATION_SYSTEM.md, slice 1).
 *
 * The role form may send the Spotify artist the person picked and their
 * answers to the Mom Test questions. The server confirms the artist itself
 * (the client's follower numbers are never trusted) and scores the entrant
 * with `admission-score/v1`, so the ranked queue orders role-form entrants
 * with everyone else instead of last.
 *
 * Mom Test answers are stored raw with their question variant and are not
 * weighted: v1 says not to tune before paid outcomes exist. The score only
 * ranks; it never lets anyone in.
 */

export const REQUEST_ACCESS_QUESTION_VARIANT = 'request-access/v1' as const;

/** Past spend on promotion, one tap. Never a "would you pay" question. */
export const PROMO_SPEND_BANDS = ['none', 'under_50', '50_plus'] as const;
export type PromoSpendBand = (typeof PROMO_SPEND_BANDS)[number];

/** Spotify artist ids are 22 base-62 characters. */
export const spotifyArtistIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z]{22}$/);

export const momTestAnswersSchema = z
  .object({
    /** "What's the last thing you did to grow your fans, and how did it go?" */
    lastGrowthAttempt: z.string().trim().min(1).max(600).optional(),
    /** "What do you pay for today to promote your music?" */
    promoSpend: z.enum(PROMO_SPEND_BANDS).optional(),
  })
  .strict();

export type MomTestAnswers = z.infer<typeof momTestAnswersSchema>;

export interface ConfirmedSpotifyArtist {
  readonly id: string;
  readonly name: string;
  readonly followers: number | null;
  readonly popularity: number | null;
}

/** Reads one artist from Spotify; null when Spotify has no such artist. */
export type SpotifyArtistReader = (
  artistId: string
) => Promise<ConfirmedSpotifyArtist | null>;

export interface RoleEntrantQualification {
  /** The id the person picked, kept even when Spotify could not be read. */
  readonly spotifyArtistId: string | null;
  /** Set only when the server confirmed the artist. */
  readonly spotifyArtistName: string | null;
  /** Null when no artist was picked or Spotify was unreachable: unscored, not judged. */
  readonly admissionScore: AdmissionScore | null;
  readonly momTest:
    | (MomTestAnswers & {
        readonly variant: typeof REQUEST_ACCESS_QUESTION_VARIANT;
        readonly capturedAt: string;
      })
    | null;
}

/** The fields stored on `qualification_inputs`; absent values are omitted. */
export function qualificationInputsPatch(
  qualification: RoleEntrantQualification
): Record<string, unknown> {
  return {
    ...(qualification.spotifyArtistId
      ? { spotifyArtistId: qualification.spotifyArtistId }
      : {}),
    ...(qualification.admissionScore
      ? { admissionScore: qualification.admissionScore }
      : {}),
    ...(qualification.momTest ? { momTest: qualification.momTest } : {}),
  };
}

export async function qualifyRoleEntrant(
  input: {
    readonly spotifyArtistId?: string | null;
    readonly momTest?: MomTestAnswers | null;
    readonly now?: Date;
  },
  readArtist: SpotifyArtistReader
): Promise<RoleEntrantQualification | null> {
  const now = input.now ?? new Date();
  const artistId = input.spotifyArtistId?.trim() || null;
  const answers = input.momTest ?? null;
  const hasAnswers = Boolean(answers?.lastGrowthAttempt || answers?.promoSpend);
  if (!artistId && !hasAnswers) return null;

  let spotifyArtistName: string | null = null;
  let admissionScore: AdmissionScore | null = null;
  if (artistId) {
    let artist: ConfirmedSpotifyArtist | null | undefined;
    try {
      artist = await readArtist(artistId);
    } catch {
      // Spotify unreachable: leave the entrant unscored rather than score a
      // real artist as unknown. The id stays stored for a later rescore.
      artist = undefined;
    }
    if (artist !== undefined) {
      spotifyArtistName = artist?.name ?? null;
      admissionScore = scoreAdmissionCandidate(
        {
          identityResolved: artist !== null,
          followers: artist?.followers ?? null,
          popularity: artist?.popularity ?? null,
          catalogReleases: null,
          latestReleaseAt: null,
          releaseStage: null,
          chatTurns: 0,
        },
        now
      );
    }
  }

  return {
    spotifyArtistId: artistId,
    spotifyArtistName,
    admissionScore,
    momTest: hasAnswers
      ? {
          ...(answers?.lastGrowthAttempt
            ? { lastGrowthAttempt: answers.lastGrowthAttempt }
            : {}),
          ...(answers?.promoSpend ? { promoSpend: answers.promoSpend } : {}),
          variant: REQUEST_ACCESS_QUESTION_VARIANT,
          capturedAt: now.toISOString(),
        }
      : null,
  };
}
