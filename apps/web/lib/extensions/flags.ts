import type {
  ExtensionDomainFlag,
  ExtensionFlagsResponse,
} from '@jovie/extension-contracts';

const BASE_DOMAINS: readonly ExtensionDomainFlag[] = [
  {
    host: 'mail.google.com',
    label: 'Gmail',
    mode: 'write',
  },
  {
    host: 'genius.com',
    label: 'Genius',
    mode: 'write',
  },
  {
    host: 'eventbrite.com',
    label: 'Eventbrite',
    mode: 'write',
  },
  {
    host: 'bandsintown.com',
    label: 'Bandsintown',
    mode: 'write',
  },
  {
    host: 'open.spotify.com',
    label: 'Spotify',
    mode: 'read',
  },
  {
    host: 'artists.spotify.com',
    label: 'Spotify for Artists',
    mode: 'read',
  },
  {
    host: 'instagram.com',
    label: 'Instagram',
    mode: 'read',
  },
] as const;

function parseDisabledDomains(): Set<string> {
  const raw = process.env.EXTENSION_DISABLED_DOMAINS?.trim();
  if (!raw) return new Set();

  return new Set(
    raw
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function getExtensionFlags(signedIn: boolean): ExtensionFlagsResponse {
  const disabled = parseDisabledDomains();

  return {
    signedIn,
    chatPromptEnabled: true,
    domains: BASE_DOMAINS.map(domain =>
      disabled.has(domain.host.toLowerCase())
        ? { ...domain, mode: 'off' as const }
        : domain
    ),
  };
}

export function getMatchingDomainFlag(host: string | null | undefined) {
  if (!host) return null;

  const normalizedHost = host.toLowerCase();
  return getExtensionFlags(true).domains.find(
    (domain: ExtensionDomainFlag) =>
      normalizedHost === domain.host ||
      normalizedHost.endsWith(`.${domain.host}`)
  );
}
