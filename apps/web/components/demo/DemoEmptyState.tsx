'use client';

import {
  Archive,
  CircleDot,
  Compass,
  Eye,
  Folder,
  Inbox,
  Layers,
  Music2,
  Repeat,
  Target,
} from 'lucide-react';
import type { DemoTab } from './demo-types';

const TAB_CONFIG: Record<
  string,
  { label: string; icon: typeof Inbox; description: string }
> = {
  inbox: {
    label: 'Inbox',
    icon: Inbox,
    description: 'Notifications and updates will appear here',
  },
  'my-releases': {
    label: 'My Releases',
    icon: Music2,
    description: 'Releases assigned to you will appear here',
  },
  campaigns: {
    label: 'Campaigns',
    icon: Target,
    description: 'Plan and track promotional campaigns',
  },
  projects: {
    label: 'Projects',
    icon: Folder,
    description: 'Organize releases into projects',
  },
  views: {
    label: 'Views',
    icon: Eye,
    description: 'Create custom filtered views',
  },
  triage: {
    label: 'Triage',
    icon: Layers,
    description: 'Review and prioritize incoming releases',
  },
  cycles: {
    label: 'Cycles',
    icon: Repeat,
    description: 'Time-boxed release planning cycles',
  },
  current: {
    label: 'Current',
    icon: CircleDot,
    description: 'Releases in the current cycle',
  },
  upcoming: {
    label: 'Upcoming',
    icon: Compass,
    description: 'Releases planned for upcoming cycles',
  },
  catalog: {
    label: 'Catalog',
    icon: Archive,
    description: 'Your full release catalog archive',
  },
  'catalog-views': {
    label: 'Views',
    icon: Eye,
    description: 'Custom catalog views and filters',
  },
};

export function DemoEmptyState({ tab }: { readonly tab: DemoTab }) {
  const config = TAB_CONFIG[tab];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <div className='flex h-full items-center justify-center'>
      <div className='flex flex-col items-center gap-3 text-center max-w-[280px]'>
        <div className='flex size-12 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.04)] border border-subtle'>
          <Icon className='size-5 text-tertiary-token' />
        </div>
        <div className='space-y-1'>
          <h3 className='text-[15px] text-primary-token [font-weight:var(--font-weight-medium)]'>
            {config.label}
          </h3>
          <p className='text-[13px] text-secondary-token leading-relaxed'>
            {config.description}
          </p>
          <p className='text-[12px] text-tertiary-token pt-1'>Coming soon</p>
        </div>
      </div>
    </div>
  );
}
