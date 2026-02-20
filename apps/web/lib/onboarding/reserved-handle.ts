import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

const MAX_SUFFIX_ATTEMPTS = 30;

function slugFromName(name: string): string {
  return name
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replaceAll(/\s+/g, ' ');
}

export function buildHandleCandidates(name: string): string[] {
  const normalizedName = slugFromName(name);
  const words = normalizedName.split(' ').filter(Boolean);

  const combined = words.join('');
  const hyphenated = words.join('-');
  const firstWord = words[0] ?? '';

  const candidates = [combined, hyphenated, firstWord]
    .map(value => normalizeUsername(value))
    .map(value => (value && /^[a-z]/.test(value) ? value : `artist-${value}`))
    .map(value => value.replaceAll(/-+/g, '-').replaceAll(/(^-+)|(-+$)/g, ''))
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .filter(value => validateUsername(value).isValid);

  if (!candidates.includes('artist')) {
    candidates.push('artist');
  }

  return candidates;
}

async function isHandleAvailable(candidate: string): Promise<boolean> {
  const [existing] = await db
    .select({ username: creatorProfiles.username })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, candidate))
    .limit(1);

  return !existing;
}

export async function reserveOnboardingHandle(name: string): Promise<string> {
  const bases = buildHandleCandidates(name);

  for (const base of bases) {
    if (await isHandleAvailable(base)) {
      return base;
    }

    for (let suffix = 1; suffix <= MAX_SUFFIX_ATTEMPTS; suffix++) {
      const candidate = `${base}${suffix}`;
      if (!validateUsername(candidate).isValid) {
        continue;
      }

      if (await isHandleAvailable(candidate)) {
        return candidate;
      }
    }
  }

  return `artist${Date.now().toString().slice(-6)}`;
}
