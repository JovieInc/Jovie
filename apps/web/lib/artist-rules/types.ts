export type ArtistRuleStrength = 'hard_constraint' | 'preference';
export type ArtistRuleScope =
  | 'artist'
  | 'channel'
  | 'release'
  | 'item_kind'
  | 'item';
export type StoredArtistRuleStatus =
  | 'suggested'
  | 'active'
  | 'superseded'
  | 'revoked';

export interface ArtistRuleView {
  readonly id: string;
  readonly category: string;
  readonly ruleKey: string;
  readonly instruction: string;
  readonly strength: ArtistRuleStrength;
  readonly scope: ArtistRuleScope;
  readonly scopeValue: string | null;
  readonly allowOverride: boolean;
  readonly status: StoredArtistRuleStatus;
  readonly provenanceSource: string | null;
  readonly confirmedAt: string | null;
  readonly createdAt: string;
}
