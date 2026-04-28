/**
 * Shared types for the shell ThreadView component family.
 *
 * Lives in its own module so callers can import the type without dragging
 * in the JSX runtime, and so sibling thread-card components stay decoupled
 * from each other.
 */

export type ThreadStatus = 'running' | 'complete' | 'errored';

/**
 * Minimum data shape required to render a `<ThreadView>`. The thread's
 * actual content (turns, cards, etc.) is passed via `children`; this
 * type only carries the metadata used for the header and any
 * status-driven affordances.
 */
export interface ThreadViewData {
  readonly id: string;
  readonly title: string;
  readonly status: ThreadStatus;
  /** Optional entity link surfaced in the header subtitle. */
  readonly entityKind?: 'release' | 'track' | 'task';
  readonly entityId?: string;
  /** ISO timestamp — most recent first when sorted descending. */
  readonly updatedAt?: string;
  /** Whether the current user has opened this thread since it last updated. */
  readonly unread?: boolean;
}
