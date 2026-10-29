import 'server-only';

import { runOnboardingCatalogImport } from '@/lib/onboarding/catalog-import.server';
import type { ProfileCertTrigger } from './profile-certification';
import {
  certifyProfile as certifyProfileCore,
  certifyWaitlistEntry as certifyWaitlistEntryCore,
  scheduleProfileCertification as scheduleProfileCertificationCore,
} from './profile-certification.server';

/**
 * Certification entry points for event hooks and routes, with the catalog
 * import wired in as remediation. catalog-import.server.ts certifies through
 * profile-certification.server.ts directly, so binding the importer here
 * keeps the two modules free of an import cycle.
 */
type WithoutImporter<T> = Omit<T, 'importCatalog'>;

export function certifyProfile(
  input: WithoutImporter<Parameters<typeof certifyProfileCore>[0]>
) {
  return certifyProfileCore({
    ...input,
    importCatalog: runOnboardingCatalogImport,
  });
}

export function certifyWaitlistEntry(
  input: WithoutImporter<Parameters<typeof certifyWaitlistEntryCore>[0]>
) {
  return certifyWaitlistEntryCore({
    ...input,
    importCatalog: runOnboardingCatalogImport,
  });
}

export function scheduleProfileCertification(input: {
  readonly profileId: string;
  readonly trigger: ProfileCertTrigger;
}): void {
  scheduleProfileCertificationCore({
    ...input,
    importCatalog: runOnboardingCatalogImport,
  });
}
