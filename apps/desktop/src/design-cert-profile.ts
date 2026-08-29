import { join } from 'node:path';

const DESIGN_CERT_PROFILE_PREFIX = '--jovie-design-cert-profile=';
const DESIGN_CERT_CDP_PORT_PREFIX = '--jovie-design-cert-cdp-port=';
const DESIGN_CERT_PROFILE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export type LocalDesignCertProfileResolution =
  | { readonly kind: 'default' }
  | { readonly kind: 'isolated'; readonly userDataPath: string }
  | { readonly kind: 'invalid'; readonly profile: string };

export type LocalDesignCertCdpResolution =
  | { readonly kind: 'disabled' }
  | { readonly kind: 'enabled'; readonly port: number }
  | { readonly kind: 'invalid'; readonly value: string };

export function resolveLocalDesignCertProfile(input: {
  readonly appEnv: 'production' | 'staging' | 'local';
  readonly appDataPath: string;
  readonly argv: readonly string[];
  readonly environmentProfile?: string;
}): LocalDesignCertProfileResolution {
  if (input.appEnv !== 'local') return { kind: 'default' };

  const argumentProfile = input.argv
    .find(argument => argument.startsWith(DESIGN_CERT_PROFILE_PREFIX))
    ?.slice(DESIGN_CERT_PROFILE_PREFIX.length);
  const profile = (argumentProfile ?? input.environmentProfile)?.trim();
  if (!profile) return { kind: 'default' };
  if (!DESIGN_CERT_PROFILE_PATTERN.test(profile)) {
    return { kind: 'invalid', profile };
  }
  return {
    kind: 'isolated',
    userDataPath: join(input.appDataPath, `Jovie-Local-Design-Cert-${profile}`),
  };
}

export function resolveLocalDesignCertCdp(input: {
  readonly appEnv: 'production' | 'staging' | 'local';
  readonly profile: LocalDesignCertProfileResolution;
  readonly argv: readonly string[];
}): LocalDesignCertCdpResolution {
  const rawPort = input.argv
    .find(argument => argument.startsWith(DESIGN_CERT_CDP_PORT_PREFIX))
    ?.slice(DESIGN_CERT_CDP_PORT_PREFIX.length);
  if (rawPort == null) return { kind: 'disabled' };
  if (input.appEnv !== 'local' || input.profile.kind !== 'isolated') {
    return { kind: 'invalid', value: rawPort };
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return { kind: 'invalid', value: rawPort };
  }
  return { kind: 'enabled', port };
}
