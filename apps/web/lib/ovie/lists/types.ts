import type { CreatorFeatures } from './learner';
import type { ListMember, OvList, suggestionPrecision } from './model';
import type { SidebarSmartView } from './smart-views';

/** Client-safe API payload shapes for /api/admin/ov-lists. */

/** An existing ingested creator profile as a list row. */
export interface ListCreator extends CreatorFeatures {
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

export interface SidebarListSummary {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly pendingSuggestions: number;
}

export interface SidebarListsPayload {
  readonly lists: readonly SidebarListSummary[];
  readonly smartViews: readonly SidebarSmartView[];
}

export interface ListDetail {
  readonly list: OvList;
  readonly creators: readonly ListCreator[];
  readonly precision: ReturnType<typeof suggestionPrecision>;
}

export interface SmartViewRow {
  readonly listId: string;
  readonly listName: string;
  readonly member: ListMember;
}

export interface SmartViewDetail {
  readonly view: { readonly id: string; readonly name: string };
  readonly rows: readonly SmartViewRow[];
  readonly creators: readonly ListCreator[];
}
