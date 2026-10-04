export const DESIGN_TASTE_JURY_DISPOSITIONS = ['ship', 'taste'] as const;

export type DesignTasteJuryDisposition =
  (typeof DESIGN_TASTE_JURY_DISPOSITIONS)[number];

export const DESIGN_TASTE_JURY_CAPTURE_STYLES = [
  'raw',
  'device-mockup',
] as const;

export type DesignTasteJuryCaptureStyle =
  (typeof DESIGN_TASTE_JURY_CAPTURE_STYLES)[number];

export interface DesignTasteBenchmarkReference {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly rationale: string;
}

export interface DesignTasteSurfaceBenchmark {
  readonly surfaceId: string;
  readonly surfaceLabel: string;
  readonly category: 'metrics' | 'marketing' | 'product-ui' | 'gallery';
  readonly primaryReferences: readonly DesignTasteBenchmarkReference[];
  readonly galleryReferences: readonly DesignTasteBenchmarkReference[];
}

export interface DesignTasteCapturePlanEntry {
  readonly scenarioId: string;
  readonly reason: string;
  readonly captureStyle: DesignTasteJuryCaptureStyle;
}

export interface DesignTasteCapturePlan {
  readonly isNonUiPush: boolean;
  readonly capture: readonly DesignTasteCapturePlanEntry[];
  readonly skipped: readonly string[];
  readonly changedFiles: readonly string[];
}

export interface DesignTasteJurorFinding {
  readonly id: string;
  readonly summary: string;
  readonly disposition: DesignTasteJuryDisposition;
  readonly rank: number;
  readonly objective: boolean;
}

export interface DesignTasteJurorVerdict {
  readonly jurorId: string;
  readonly modelLabel: string;
  readonly findings: readonly DesignTasteJurorFinding[];
}

export interface DesignTasteConsensusFinding {
  readonly id: string;
  readonly summary: string;
  readonly disposition: DesignTasteJuryDisposition;
  readonly consensusRank: number;
  readonly voteCount: number;
  readonly jurorIds: readonly string[];
  readonly objective: boolean;
}

export interface DesignTasteJuryConsensus {
  readonly runId: string;
  readonly surfaceId: string;
  readonly computedAt: string;
  readonly findings: readonly DesignTasteConsensusFinding[];
}

export interface DesignTasteIssueFiling {
  readonly id: string;
  readonly disposition: DesignTasteJuryDisposition;
  readonly title: string;
  readonly body: string;
  readonly referenceComps: readonly DesignTasteBenchmarkReference[];
  readonly queue: 'visual-qa' | 'tim-taste';
}
