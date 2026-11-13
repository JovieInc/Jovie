import type { ReactNode } from 'react';
import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';
import type { OpportunityInboxData } from '@/lib/connectors/opportunity-inbox-types';
import type { AvailableDSP } from '@/lib/dsp';

export interface OpportunityInboxPageClientProps {
  readonly inbox: OpportunityInboxData;
  readonly profileId?: string | null;
  readonly initialView?: 'needs' | 'done';
  /** Secondary content follows primary work inside the same scroll surface. */
  readonly supplementaryContent?: ReactNode;
  readonly connectedDSPs?: readonly AvailableDSP[];
  readonly initialLinks?: readonly ProfileSocialLink[];
}
