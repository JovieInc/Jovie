export const PACKAGE_NAME = '@jovie/cli' as const;
export const NPM_REGISTRY_URL = 'https://registry.npmjs.org' as const;
export const PUBLICATION_WORKFLOW =
  '.github/workflows/npm-publish.yml' as const;
export const SOURCE_DIRECTORY = 'packages/jovie-cli' as const;

export type PublicationGateId =
  | 'main-ref'
  | 'main-sha'
  | 'unpublished-version'
  | 'provenance'
  | 'npm-token'
  | 'ownership';

export type PublicationGate = {
  readonly id: PublicationGateId;
  readonly passed: boolean;
  readonly reason: string;
};

export type RegistryState = {
  readonly status: number;
  readonly published: boolean;
  readonly version?: string;
  readonly maintainers?: readonly string[];
  readonly provenance?: boolean;
};

export type PublicationReceipt = {
  readonly identity: {
    readonly name: typeof PACKAGE_NAME;
    readonly access: 'public';
    readonly provenanceRequired: true;
    readonly registry: typeof NPM_REGISTRY_URL;
    readonly homepage: string;
    readonly sourceDirectory: typeof SOURCE_DIRECTORY;
  };
  readonly localVersion: string;
  readonly sourceSha: string;
  readonly hostedCi: typeof PUBLICATION_WORKFLOW;
  readonly registry: RegistryState;
  readonly gates: readonly PublicationGate[];
  readonly publicationPermitted: boolean;
  readonly blockedBy: readonly PublicationGateId[];
};

export type PublicationReceiptInput = {
  readonly homepage: string;
  readonly localVersion: string;
  readonly sourceSha: string;
  readonly gitRef: string;
  readonly originMainSha: string;
  readonly npmTokenPresent: boolean;
  readonly scopeWriteAccessProven?: boolean;
  readonly registryStatus: number;
  readonly registryVersion?: string;
  readonly maintainers?: readonly string[];
  readonly registryProvenance?: boolean;
};

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].toSorted();
}

export function buildPublicationReceipt(
  input: PublicationReceiptInput
): PublicationReceipt {
  const published = input.registryStatus === 200;
  const onMain = input.gitRef === 'refs/heads/main';
  const matchesMain = input.sourceSha === input.originMainSha;
  const unpublishedVersion = input.registryStatus === 404;
  const listedMaintainers = uniqueSorted(input.maintainers ?? []);
  const ownershipProven = input.scopeWriteAccessProven === true;

  const gates: readonly PublicationGate[] = [
    {
      id: 'main-ref',
      passed: onMain,
      reason: onMain
        ? 'Publication is running on refs/heads/main.'
        : `Publication is main-only; current ref is ${input.gitRef}.`,
    },
    {
      id: 'main-sha',
      passed: matchesMain,
      reason: matchesMain
        ? 'Checked-out SHA matches origin/main.'
        : 'Checked-out SHA is not the current origin/main commit.',
    },
    {
      id: 'unpublished-version',
      passed: unpublishedVersion,
      reason: unpublishedVersion
        ? `${PACKAGE_NAME}@${input.localVersion} is unpublished on npm.`
        : published
          ? `${PACKAGE_NAME} is already on the registry; refuse a duplicate version.`
          : `Could not prove ${PACKAGE_NAME}@${input.localVersion} is unpublished (HTTP ${input.registryStatus}).`,
    },
    {
      id: 'provenance',
      passed: true,
      reason:
        'npm publish --provenance --access public remains required; this receipt never drops provenance.',
    },
    {
      id: 'npm-token',
      passed: input.npmTokenPresent,
      reason: input.npmTokenPresent
        ? 'An npm auth token is present for the guarded workflow.'
        : 'secrets.NPM_TOKEN is absent; the guarded workflow cannot authenticate to npm.',
    },
    {
      id: 'ownership',
      passed: ownershipProven,
      reason: ownershipProven
        ? listedMaintainers.length > 0
          ? `Authorized @jovie scope write access is proven; maintainers: ${listedMaintainers.join(', ')}.`
          : 'Authorized @jovie scope write access is proven outside this receipt.'
        : 'npm ownership/access for the @jovie scope cannot be proven from this checkout; the guarded main-only workflow still requires an authorized npm identity, 2FA, and provenance.',
    },
  ];

  const blockedBy = gates.filter(gate => !gate.passed).map(gate => gate.id);

  return {
    identity: {
      name: PACKAGE_NAME,
      access: 'public',
      provenanceRequired: true,
      registry: NPM_REGISTRY_URL,
      homepage: input.homepage,
      sourceDirectory: SOURCE_DIRECTORY,
    },
    localVersion: input.localVersion,
    sourceSha: input.sourceSha,
    hostedCi: PUBLICATION_WORKFLOW,
    registry: {
      status: input.registryStatus,
      published,
      ...(input.registryVersion ? { version: input.registryVersion } : {}),
      ...(listedMaintainers.length > 0
        ? { maintainers: listedMaintainers }
        : {}),
      ...(input.registryProvenance === undefined
        ? {}
        : { provenance: input.registryProvenance }),
    },
    gates,
    publicationPermitted: blockedBy.length === 0,
    blockedBy,
  };
}

export async function probeNpmRegistry(
  fetchImpl: typeof fetch = fetch,
  packageName: string = PACKAGE_NAME
): Promise<{ readonly status: number; readonly body: unknown }> {
  const encodedName = encodeURIComponent(packageName);
  const response = await fetchImpl(`${NPM_REGISTRY_URL}/${encodedName}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  let body: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  return { status: response.status, body };
}
