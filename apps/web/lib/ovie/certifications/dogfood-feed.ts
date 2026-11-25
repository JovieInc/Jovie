/**
 * Explicit dogfood receipt / mission coverage feed on the section-8 projection
 * (JOV-7200). Disconnected until the ledger is present; fixture bindings may
 * graduate to production without a second store.
 */
export interface DogfoodFeedProjection {
  readonly status: 'disconnected' | 'fixture' | 'production';
  readonly receiptCount: number;
  readonly subjectsWithRequiredMissions: number;
  readonly subjectsWithDeploy: number;
  readonly knownGoodDeploymentCount: number;
}

export function projectDogfoodFeed(input: {
  readonly dogfoodFeed?: DogfoodFeedProjection;
  readonly subjects: readonly {
    readonly requiredMissions: readonly unknown[];
    readonly deploy: unknown;
  }[];
  readonly receipts: readonly unknown[];
  readonly knownGoodDeploymentIds: readonly string[];
}): DogfoodFeedProjection {
  if (input.dogfoodFeed) return input.dogfoodFeed;
  return {
    status: 'disconnected',
    receiptCount: input.receipts.length,
    subjectsWithRequiredMissions: input.subjects.filter(
      subject => subject.requiredMissions.length > 0
    ).length,
    subjectsWithDeploy: input.subjects.filter(
      subject => subject.deploy !== null
    ).length,
    knownGoodDeploymentCount: input.knownGoodDeploymentIds.length,
  };
}
