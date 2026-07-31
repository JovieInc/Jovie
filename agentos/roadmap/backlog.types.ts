/**
 * Machine-readable Linear → repo mirror types for AgentOS roadmap.
 * Canonical contract: agentos/roadmap/SYNC_MODEL.md §3 (JOV-1930).
 * Written by `/roadmap sync` (JOV-1932). Do not hand-edit backlog.json.
 */

export type RoadmapProjectStatus =
  | 'planned'
  | 'started'
  | 'paused'
  | 'completed'
  | 'canceled';

export type RoadmapStateType =
  | 'triage'
  | 'backlog'
  | 'unstarted'
  | 'started'
  | 'completed'
  | 'canceled';

/** Linear priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low */
export type RoadmapPriority = 0 | 1 | 2 | 3 | 4;

export interface RoadmapBacklog {
  /** ISO datetime of the last successful Linear → repo sync */
  readonly syncedAt: string;
  /** SHA of the Linear MCP/GraphQL revision used to build this snapshot, if available */
  readonly sourceRevision: string | null;
  /** AgentOS initiative-level metadata */
  readonly initiative: {
    readonly id: string;
    readonly name: string;
    readonly url: string;
  };
  readonly projects: readonly RoadmapProject[];
  readonly issues: readonly RoadmapIssue[];
}

export interface RoadmapProject {
  readonly id: string;
  readonly name: string;
  /** kebab-case used for repo file matching */
  readonly slug: string;
  readonly status: RoadmapProjectStatus;
  readonly url: string;
  /** Path (relative to repo root) of the spec mirror, if one exists */
  readonly specPath: string | null;
}

export interface RoadmapIssue {
  /** Linear short ID, e.g. "JOV-1930" */
  readonly id: string;
  /** Linear UUID (for MCP write calls) */
  readonly uuid: string;
  readonly title: string;
  readonly url: string;

  readonly state: {
    readonly name: string;
    readonly type: RoadmapStateType;
  };
  readonly priority: RoadmapPriority;
  readonly assignee: { readonly id: string; readonly name: string } | null;
  readonly delegate: { readonly id: string; readonly name: string } | null;
  readonly labels: readonly string[];

  readonly projectId: string | null;
  /** Linear parent issue short ID (sub-issue link) */
  readonly parentId: string | null;
  /** Linear short IDs */
  readonly blockedBy: readonly string[];
  readonly blocks: readonly string[];

  /** Computed by the sync job from SYNC_MODEL §2.3 */
  readonly agentOwned: boolean;
  readonly humanReviewRequired: boolean;

  /** Repo paths referenced in the issue description */
  readonly repoFileRefs: readonly string[];

  /** Derived: matches an attached PR via `<!-- linear-issue-id:JOV-XXXX -->` */
  readonly pullRequestUrl: string | null;

  readonly createdAt: string;
  readonly updatedAt: string;
  /** ISO datetime this row was last refreshed from Linear */
  readonly lastSyncedAt: string;
}
