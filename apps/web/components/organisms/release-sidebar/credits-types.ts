export type SmartLinkCreditRole =
  | 'main_artist'
  | 'featured_artist'
  | 'producer'
  | 'co_producer'
  | 'composer'
  | 'lyricist'
  | 'arranger'
  | 'conductor'
  | 'remixer'
  | 'mix_engineer'
  | 'mastering_engineer'
  | 'other';

export interface CreditEntry {
  artistId: string;
  name: string;
  handle: string | null;
  role: SmartLinkCreditRole;
  position: number;
}

export interface CreditGroup {
  role: SmartLinkCreditRole;
  label: string;
  entries: CreditEntry[];
}
