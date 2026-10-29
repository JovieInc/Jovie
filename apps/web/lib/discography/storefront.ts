import { COUNTRY_CODE_COOKIE } from '@/constants/app';

/**
 * Apple Music storefront codes (lowercase ISO 3166-1 alpha-2). A visitor
 * country outside this set keeps the stored link unchanged.
 */
const APPLE_MUSIC_STOREFRONTS: ReadonlySet<string> = new Set(
  (
    'ae ag ai al am ao ar at au az bb be bf bg bh bj bm bn bo br bs bt bw by bz ' +
    'ca cd cg ch ci cl cm cn co cr cv cy cz de dk dm do dz ec ee eg es fi fj fm ' +
    'fr ga gb gd ge gh gm gr gt gw gy hk hn hr hu id ie il in iq is it jm jo jp ' +
    'ke kg kh kn kr kw ky kz la lb lc lk lr lt lu lv ly ma md me mg mk ml mm mn ' +
    'mo mr ms mt mu mv mw mx my mz na ne ng ni nl no np nr nz om pa pe pg ph pk ' +
    'pl pt pw py qa ro rs ru rw sa sb sc se sg si sk sl sn sr st sv sz tc td th ' +
    'tj tm tn to tr tt tv tw tz ua ug us uy uz vc ve vg vn vu ws xk ye za zm zw'
  ).split(' ')
);

const APPLE_MUSIC_HOSTS = new Set(['music.apple.com', 'geo.music.apple.com']);
const STOREFRONT_SEGMENT = /^[a-z]{2}$/i;

export function normalizeVisitorCountry(
  value: string | null | undefined
): string | null {
  const code = value?.trim().toLowerCase();
  return code && APPLE_MUSIC_STOREFRONTS.has(code) ? code : null;
}

/**
 * Point an Apple Music link at the visitor's own storefront. Stored links carry
 * the storefront they were discovered in (usually /us/), which sends everyone
 * else to the wrong catalog. Falls back to the stored link when the country is
 * unknown/unsupported or the URL has no storefront segment.
 */
export function localizeAppleMusicUrl(
  url: string,
  country: string | null | undefined
): string {
  const storefront = normalizeVisitorCountry(country);
  if (!storefront) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!APPLE_MUSIC_HOSTS.has(parsed.hostname)) return url;

  const segments = parsed.pathname.split('/');
  // ['', '<storefront>', 'album', ...]
  if (segments.length < 3 || !STOREFRONT_SEGMENT.test(segments[1] ?? '')) {
    return url;
  }
  segments[1] = storefront;
  parsed.pathname = segments.join('/');
  return parsed.toString();
}

/** Apply the visitor's storefront to a provider link (Apple Music only). */
export function localizeProviderUrl(
  providerId: string,
  url: string,
  country: string | null | undefined
): string {
  return providerId === 'apple_music'
    ? localizeAppleMusicUrl(url, country)
    : url;
}

/** Client-only: the platform-geo country mirrored into the jv_country cookie. */
export function readVisitorCountryCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const entry = document.cookie
    .split(';')
    .find(cookie => cookie.trim().startsWith(`${COUNTRY_CODE_COOKIE}=`));
  return entry ? normalizeVisitorCountry(entry.split('=')[1]) : null;
}
