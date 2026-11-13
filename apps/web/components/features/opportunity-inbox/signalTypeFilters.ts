import {
  OPPORTUNITY_SIGNAL_TYPE_META,
  type OpportunitySignalType,
} from '@/lib/connectors/opportunity-inbox-signal-type';

export type SignalTypeFilter = OpportunitySignalType | 'all';

export const SIGNAL_TYPE_FILTERS: readonly {
  readonly value: SignalTypeFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'All' },
  {
    value: 'new_song',
    label: OPPORTUNITY_SIGNAL_TYPE_META.new_song.filterLabel,
  },
  {
    value: 'new_event',
    label: OPPORTUNITY_SIGNAL_TYPE_META.new_event.filterLabel,
  },
  {
    value: 'new_profile_match',
    label: OPPORTUNITY_SIGNAL_TYPE_META.new_profile_match.filterLabel,
  },
  {
    value: 'brand_deal',
    label: OPPORTUNITY_SIGNAL_TYPE_META.brand_deal.filterLabel,
  },
  {
    value: 'fan_reply',
    label: OPPORTUNITY_SIGNAL_TYPE_META.fan_reply.filterLabel,
  },
];
