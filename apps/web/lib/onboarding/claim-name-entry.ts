import { normalizeArtistNameToHandleBase } from '@/lib/discography/friendly-artist-handle';
import { normalizeHandleCandidate } from './handle-availability';

/** A suggestion from user input, never an identity or ownership observation. */
export function resolveClaimNameEntry(raw: string): {
  readonly handle: string;
  readonly displayName: string | null;
  readonly error: string | null;
} {
  const value = raw.trim();
  if (!value) return { handle: '', displayName: null, error: null };
  if (value.length > 80 || /[\u0000-\u001f\u007f]/.test(value)) {
    return {
      handle: '',
      displayName: null,
      error: 'Use a name of up to 80 characters.',
    };
  }
  // Explicit handles stay handles. Never transliterate a pasted handle or URL
  // as a person's name, or silently substitute another public destination.
  if (
    /^@?[a-z0-9._-]+$/i.test(value) &&
    (value.startsWith('@') || /[._-]/.test(value) || /^\d+$/.test(value))
  ) {
    return {
      handle: normalizeHandleCandidate(value),
      displayName: null,
      error: null,
    };
  }
  if (!/^[\p{L}\p{M}\p{N}\s.’'-]+$/u.test(value) || !/\p{L}/u.test(value)) {
    return {
      handle: '',
      displayName: null,
      error: 'Enter your name or @handle, rather than a link.',
    };
  }
  return {
    handle: normalizeArtistNameToHandleBase(value),
    displayName: value,
    error: null,
  };
}
