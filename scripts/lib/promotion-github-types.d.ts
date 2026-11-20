// Response fields consumed by the protected GitHub adapter. Endpoint identity,
// pagination, receipt trust and freshness are checked by the runtime consumers.
export interface QueueConnection {
  nodes: unknown[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}
export interface GitHubJson {
  [key: string]: unknown;
  archiveBase64?: string;
  total_count?: number;
  errors?: unknown[];
  data?: { repository?: { mergeQueue?: { entries?: QueueConnection } } };
  path?: string;
  event?: string;
  head_branch?: string;
  head_repository?: { full_name: string };
  object?: { sha: string };
  base?: { ref: string };
  head?: { sha: string; repo?: { full_name: string } };
  title?: string;
  body?: string;
  labels?: { name: string }[];
  merge_commit_sha?: string;
  changed_files?: number;
  tree?: { sha: string };
  parents?: { sha: string }[];
  mergeable?: boolean;
  ahead_by?: number;
  committer?: { date: string };
  merge_base_commit?: { commit: { committer: { date: string } } };
}
