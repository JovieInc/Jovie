export type ArtistRuleStrength = 'hard_constraint' | 'preference';

export interface ArtistRuleView {
  readonly id: string;
  readonly category: string;
  readonly ruleKey: string;
  readonly instruction: string;
  readonly strength: ArtistRuleStrength;
  readonly scope: 'artist' | 'channel' | 'release' | 'item_kind' | 'item';
  readonly scopeValue: string | null;
  readonly allowOverride: boolean;
  readonly status: 'suggested' | 'active' | 'superseded' | 'revoked';
  readonly provenanceSource:
    | 'artist'
    | 'authorized_team'
    | 'memory'
    | 'contract';
  readonly confirmedAt: string | null;
  readonly createdAt: string;
}
