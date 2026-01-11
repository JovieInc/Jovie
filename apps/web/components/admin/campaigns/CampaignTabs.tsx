'use client';

import { useState } from 'react';

import { Icon } from '@/components/atoms/Icon';

import { FollowUpManager } from './FollowUpManager';
import { InviteCampaignManager } from './InviteCampaignManager';

type TabId = 'initial' | 'followup';

interface Tab {
  id: TabId;
  label: string;
  icon: 'Send' | 'MailPlus';
  description: string;
}

const TABS: Tab[] = [
  {
    id: 'initial',
    label: 'Initial Invites',
    icon: 'Send',
    description: 'Send first invite to new profiles',
  },
  {
    id: 'followup',
    label: 'Follow-ups',
    icon: 'MailPlus',
    description: 'Send reminders to non-responders',
  },
];

export function CampaignTabs() {
  const [activeTab, setActiveTab] = useState<TabId>('initial');

  return (
    <div className='space-y-6'>
      {/* Tab Navigation */}
      <div className='flex border-b border-subtle'>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type='button'
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors
              border-b-2 -mb-px
              ${
                activeTab === tab.id
                  ? 'border-primary text-primary-token'
                  : 'border-transparent text-secondary-token hover:text-primary-token hover:border-subtle'
              }
            `}
          >
            <Icon name={tab.icon} className='h-4 w-4' />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'initial' && <InviteCampaignManager />}
        {activeTab === 'followup' && (
          <section className='rounded-lg border border-subtle bg-surface-1 p-6'>
            <div className='mb-6'>
              <h2 className='text-lg font-semibold text-primary-token'>
                Follow-up Emails
              </h2>
              <p className='mt-1 text-sm text-secondary-token'>
                Send reminders to creators who received an initial invite but
                haven't claimed their profile yet. Configure timing and batch
                size below.
              </p>
            </div>
            <FollowUpManager />
          </section>
        )}
      </div>
    </div>
  );
}
