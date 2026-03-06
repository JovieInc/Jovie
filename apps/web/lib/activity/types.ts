export type ActivityEntityType =
  | 'profile'
  | 'release'
  | 'audience_member'
  | 'contact';

export type ActivityAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'enriched'
  | 'linked'
  | 'unlinked'
  | 'synced'
  | 'published'
  | 'imported'
  | 'verified'
  | 'claimed';

export interface ActivityActor {
  type: 'user' | 'system';
  name: string;
}

export interface ActivityEvent {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  actor?: ActivityActor;
}
