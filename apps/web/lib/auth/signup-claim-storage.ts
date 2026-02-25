export const DEFAULT_SIGNUP_CLAIM_TTL_MS = 10 * 60 * 1000;
export const SIGNUP_SPOTIFY_URL_KEY = 'jovie_signup_spotify_url';
export const SIGNUP_ARTIST_NAME_KEY = 'jovie_signup_artist_name';
export const SIGNUP_SPOTIFY_EXPECTED_KEY = 'jovie_signup_spotify_expected';

interface StoredSignupClaimValue {
  value: string;
  ts: number;
}

interface ReadSignupClaimValueOptions {
  now?: number;
  ttlMs?: number;
}

function parseStoredValue(raw: string): StoredSignupClaimValue | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSignupClaimValue>;

    if (typeof parsed.value !== 'string' || typeof parsed.ts !== 'number') {
      return null;
    }

    return {
      value: parsed.value,
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
}

export function persistSignupClaimValue(
  key: string,
  value: string,
  ts = Date.now()
): void {
  const payload = JSON.stringify({
    value,
    ts,
  } satisfies StoredSignupClaimValue);

  sessionStorage.setItem(key, payload);
  localStorage.setItem(key, payload);
}

export function readSignupClaimValue(
  key: string,
  {
    now = Date.now(),
    ttlMs = DEFAULT_SIGNUP_CLAIM_TTL_MS,
  }: ReadSignupClaimValueOptions = {}
): string | null {
  const sessionValue = readFromStorage(sessionStorage, key, now, ttlMs);
  if (sessionValue) return sessionValue;

  const localValue = readFromStorage(localStorage, key, now, ttlMs);
  if (localValue) {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        value: localValue,
        ts: now,
      } satisfies StoredSignupClaimValue)
    );
  }

  return localValue;
}

export function clearSignupClaimValue(key: string): void {
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
}

function readFromStorage(
  storage: Storage,
  key: string,
  now: number,
  ttlMs: number
): string | null {
  const raw = storage.getItem(key);
  if (!raw) return null;

  const structuredValue = parseStoredValue(raw);

  // Legacy values written before timestamp support.
  if (structuredValue === null) {
    return raw;
  }

  const ageMs = now - structuredValue.ts;
  if (ageMs < 0 || ageMs > ttlMs) {
    storage.removeItem(key);
    return null;
  }

  return structuredValue.value;
}
