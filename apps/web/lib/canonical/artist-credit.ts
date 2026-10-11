/**
 * Semantic contract for artist credit edges (`release_artists`,
 * `track_artists`, `recording_artists`). JOV-6543 — adoption of the
 * JOV-5922 semantic-contract primitive for music-credit admission.
 *
 * A credit row is not canonical just because its columns type-check. The
 * contract enforces, at the shared canonical write boundary:
 * - the credited entity is a real registry identity (UUID `artist_id`), not
 *   a name or handle;
 * - the role is a supported `artist_role` value;
 * - `is_primary` is only admissible on a primary-capable role — an
 *   unsupported featured/remixer/producer→primary promotion is quarantined,
 *   never silently admitted;
 * - `position` is a non-negative integer so source order stays lossless.
 *
 * Dedup of co-primaries, cross-provider disagreement, and credit-set
 * completeness remain producer concerns; this contract only decides whether
 * a single credit edge is admissible.
 */

import type { ArtistRole } from '@/lib/db/schema/content';
import { artistRoleEnum } from '@/lib/db/schema/enums';
import { isPrimaryArtistRole } from '@/lib/discography/artist-credit-policy';

import {
  type CanonicalProvenance,
  type ContractRejection,
  defineSemanticContract,
} from './semantic-contract';

export const ARTIST_CREDIT_FIELD = 'artist_credit';
export const ARTIST_CREDIT_CONTRACT_VERSION = 1;
export const ARTIST_CREDIT_CONTRACT_OWNER = 'platform-profiles';

export type ArtistCreditRejectionCode =
  | 'not_an_object'
  | 'invalid_artist_id'
  | 'unsupported_role'
  | 'invalid_position'
  | 'invalid_primary_flag'
  | 'unsupported_primary_promotion';

/** Canonical credit edge admitted by the contract. */
export interface CanonicalArtistCredit {
  readonly artistId: string;
  readonly role: ArtistRole;
  readonly isPrimary: boolean;
  readonly position: number;
}

function reject(
  code: ArtistCreditRejectionCode,
  detail: string
): ContractRejection {
  return { code, detail };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUPPORTED_ROLES = new Set<string>(artistRoleEnum.enumValues);

export const ARTIST_CREDIT_CONTRACT =
  defineSemanticContract<CanonicalArtistCredit>({
    field: ARTIST_CREDIT_FIELD,
    version: ARTIST_CREDIT_CONTRACT_VERSION,
    owner: ARTIST_CREDIT_CONTRACT_OWNER,
    evaluate(raw: unknown, _provenance: CanonicalProvenance) {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return {
          ok: false,
          rejections: [
            reject(
              'not_an_object',
              'artist credit must be an object of { artistId, role, isPrimary, position }'
            ),
          ],
        };
      }

      const input = raw as Record<string, unknown>;
      const rejections: ContractRejection[] = [];

      if (
        typeof input.artistId !== 'string' ||
        !UUID_PATTERN.test(input.artistId)
      ) {
        rejections.push(
          reject(
            'invalid_artist_id',
            'credit must reference a canonical artist registry UUID, not a name or handle'
          )
        );
      }

      const role = input.role;
      if (typeof role !== 'string' || !SUPPORTED_ROLES.has(role)) {
        rejections.push(
          reject(
            'unsupported_role',
            `role '${String(role)}' is not a supported artist_role`
          )
        );
      }

      if (
        input.isPrimary !== undefined &&
        typeof input.isPrimary !== 'boolean'
      ) {
        rejections.push(
          reject('invalid_primary_flag', 'isPrimary must be a boolean')
        );
      }

      const position = input.position ?? 0;
      if (
        typeof position !== 'number' ||
        !Number.isInteger(position) ||
        position < 0
      ) {
        rejections.push(
          reject(
            'invalid_position',
            'position must be a non-negative integer preserving source order'
          )
        );
      }

      const isPrimary = input.isPrimary === true;
      if (
        isPrimary &&
        typeof role === 'string' &&
        SUPPORTED_ROLES.has(role) &&
        !isPrimaryArtistRole(role as ArtistRole)
      ) {
        rejections.push(
          reject(
            'unsupported_primary_promotion',
            `role '${role}' cannot be admitted as a primary credit; featured/remixer/production roles are never promoted to primary`
          )
        );
      }

      if (rejections.length > 0) {
        return { ok: false, rejections };
      }

      return {
        ok: true,
        canonical: {
          artistId: input.artistId as string,
          role: role as ArtistRole,
          isPrimary,
          position: position as number,
        },
      };
    },
  });

/** Admit an artist credit edge observation. Pure; safe to call anywhere. */
export function admitArtistCredit(
  raw: unknown,
  provenance: CanonicalProvenance
) {
  return ARTIST_CREDIT_CONTRACT.admit(raw, provenance);
}
