import type {
  ExtensionDomainFlag,
  ExtensionFlagsResponse,
  ExtensionPageKind,
  ExtensionWorkflowId,
} from '@jovie/extension-contracts';

export interface DomainPageConfig {
  readonly host: string;
  readonly label: string;
  readonly mode: ExtensionDomainFlag['mode'];
  readonly pageKind: ExtensionPageKind;
  readonly pageLabel: string;
  readonly workflowId: ExtensionWorkflowId;
}

export const DOMAIN_CONFIGS: readonly DomainPageConfig[] = [
  {
    host: 'distrokid.com',
    label: 'DistroKid',
    mode: 'write',
    pageKind: 'release',
    pageLabel: 'DistroKid Release Form',
    workflowId: 'distrokid_release_form',
  },
  {
    host: 'workstation.awal.com',
    label: 'AWAL',
    mode: 'write',
    pageKind: 'release',
    pageLabel: 'AWAL Project Form',
    workflowId: 'awal_release_form',
  },
  {
    host: 'app.kosignmusic.com',
    label: 'Kosign',
    mode: 'write',
    pageKind: 'release',
    pageLabel: 'Kosign Work Submission',
    workflowId: 'kosign_work_form',
  },
] as const;

const BASE_DOMAINS: readonly ExtensionDomainFlag[] = DOMAIN_CONFIGS.map(
  config => ({
    host: config.host,
    label: config.label,
    mode: config.mode,
  })
);

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

export function getMatchingDomainConfig(
  host: string | null | undefined
): DomainPageConfig | null {
  if (!host) return null;

  const normalizedHost = host.toLowerCase();
  return (
    DOMAIN_CONFIGS.find(
      config =>
        normalizedHost === config.host ||
        normalizedHost.endsWith(`.${config.host}`)
    ) ?? null
  );
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
