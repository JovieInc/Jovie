import type {
  ExtensionDomainFlag,
  ExtensionFlagsResponse,
} from '@jovie/extension-contracts';

const BASE_DOMAINS: readonly ExtensionDomainFlag[] = [
  {
    host: 'distrokid.com',
    label: 'DistroKid',
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
    chatPromptEnabled: false,
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
