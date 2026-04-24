'use client';

import { Button, Input, Switch } from '@jovie/ui';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  DrawerButton,
  DrawerFormField,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { APP_ROUTES } from '@/constants/routes';

// Mirrored from schema to avoid server-only import in client component
interface InvestorSettings {
  id: string;
  showProgressBar: boolean;
  raiseTarget: number | null;
  committedAmount: number | null;
  investorCount: number | null;
  bookCallUrl: string | null;
  investUrl: string | null;
  slackWebhookUrl: string | null;
  followupEnabled: boolean;
  followupDelayHours: number;
  engagedThreshold: number;
  updatedAt: Date;
}

interface SettingsFormState {
  showProgressBar: boolean;
  raiseTarget: string;
  committedAmount: string;
  investorCount: string;
  bookCallUrl: string;
  investUrl: string;
  slackWebhookUrl: string;
  followupEnabled: boolean;
  followupDelayHours: string;
  engagedThreshold: string;
}

const DEFAULT_STATE: SettingsFormState = {
  showProgressBar: false,
  raiseTarget: '',
  committedAmount: '',
  investorCount: '',
  bookCallUrl: '',
  investUrl: '',
  slackWebhookUrl: '',
  followupEnabled: false,
  followupDelayHours: '48',
  engagedThreshold: '50',
};

function settingsToFormState(
  settings: InvestorSettings | null
): SettingsFormState {
  if (!settings) return DEFAULT_STATE;
  return {
    showProgressBar: settings.showProgressBar,
    raiseTarget: settings.raiseTarget?.toString() ?? '',
    committedAmount: settings.committedAmount?.toString() ?? '',
    investorCount: settings.investorCount?.toString() ?? '',
    bookCallUrl: settings.bookCallUrl ?? '',
    investUrl: settings.investUrl ?? '',
    slackWebhookUrl: settings.slackWebhookUrl ?? '',
    followupEnabled: settings.followupEnabled,
    followupDelayHours: settings.followupDelayHours.toString(),
    engagedThreshold: settings.engagedThreshold.toString(),
  };
}

function safeParseInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function formStateToPayload(state: SettingsFormState) {
  return {
    showProgressBar: state.showProgressBar,
    raiseTarget: safeParseInt(state.raiseTarget),
    committedAmount: safeParseInt(state.committedAmount),
    investorCount: safeParseInt(state.investorCount),
    bookCallUrl: state.bookCallUrl.trim() || null,
    investUrl: state.investUrl.trim() || null,
    slackWebhookUrl: state.slackWebhookUrl.trim() || null,
    followupEnabled: state.followupEnabled,
    followupDelayHours: safeParseInt(state.followupDelayHours) ?? 48,
    engagedThreshold: safeParseInt(state.engagedThreshold) ?? 50,
  };
}

function SettingRow({
  label,
  description,
  children,
}: {
  readonly label: string;
  readonly description: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='flex items-start justify-between gap-4 py-3'>
      <div className='min-w-0 flex-1'>
        <p className='text-[13px] font-semibold text-primary-token'>{label}</p>
        <p className='mt-0.5 text-[12px] leading-[18px] text-secondary-token'>
          {description}
        </p>
      </div>
      <div className='shrink-0'>{children}</div>
    </div>
  );
}

export function InvestorSettingsForm() {
  const [form, setForm] = useState<SettingsFormState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/investors/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      setForm(settingsToFormState(data.settings));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch('/api/admin/investors/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formStateToPayload(form)),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || `Failed to save settings (${res.status})`
        );
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof SettingsFormState>(
    field: K,
    value: SettingsFormState[K]
  ) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Loading settings'
          subtitle='Preparing portal configuration.'
        />
        <div className='space-y-2 px-6 py-6'>
          {Array.from({ length: 5 }, (_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders never reorder
              key={`skeleton-${i}`}
              className='h-10 animate-pulse rounded-lg bg-surface-0'
            />
          ))}
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Fundraise Display */}
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Investor portal settings'
          subtitle='Configure the fundraise display, CTAs, and automation for the investor portal.'
          actions={
            <Button variant='secondary' size='sm' asChild>
              <Link href={APP_ROUTES.ADMIN_INVESTORS}>
                <ArrowLeft className='mr-1.5 h-3.5 w-3.5' />
                Pipeline
              </Link>
            </Button>
          }
        />
        <div className='divide-y divide-subtle px-(--linear-app-content-padding-x)'>
          <SettingRow
            label='Show progress bar'
            description='Display a fundraise progress bar in the investor portal sticky bar.'
          >
            <Switch
              checked={form.showProgressBar}
              onCheckedChange={(checked: boolean) =>
                updateField('showProgressBar', checked)
              }
            />
          </SettingRow>

          <div className='grid gap-4 py-4 sm:grid-cols-3'>
            <DrawerFormField
              label='Raise target ($)'
              helperText='Total fundraise goal'
            >
              <Input
                type='number'
                placeholder='2000000'
                value={form.raiseTarget}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateField('raiseTarget', e.target.value)
                }
                className='w-full'
              />
            </DrawerFormField>

            <DrawerFormField
              label='Committed ($)'
              helperText='Amount committed so far'
            >
              <Input
                type='number'
                placeholder='500000'
                value={form.committedAmount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateField('committedAmount', e.target.value)
                }
                className='w-full'
              />
            </DrawerFormField>

            <DrawerFormField
              label='Investor count'
              helperText='Number of investors committed'
            >
              <Input
                type='number'
                placeholder='12'
                value={form.investorCount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateField('investorCount', e.target.value)
                }
                className='w-full'
              />
            </DrawerFormField>
          </div>
        </div>
      </ContentSurfaceCard>

      {/* CTA URLs */}
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Call-to-action URLs'
          subtitle='Configure the buttons that appear in the investor portal sticky bar.'
        />
        <div className='space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
          <DrawerFormField
            label='Book a call URL'
            helperText='Link to your Calendly, Cal.com, or scheduling page.'
          >
            <Input
              type='url'
              placeholder='https://calendly.com/you/investor-call'
              value={form.bookCallUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateField('bookCallUrl', e.target.value)
              }
              className='w-full'
            />
          </DrawerFormField>

          <DrawerFormField
            label='Invest URL'
            helperText='Link to your investment form (e.g., AngelList, DocSend, or SAFE).'
          >
            <Input
              type='url'
              placeholder='https://angellist.com/fund/your-deal'
              value={form.investUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateField('investUrl', e.target.value)
              }
              className='w-full'
            />
          </DrawerFormField>
        </div>
      </ContentSurfaceCard>

      {/* Automation */}
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Automation'
          subtitle='Configure follow-up behavior and engagement scoring.'
        />
        <div className='divide-y divide-subtle px-(--linear-app-content-padding-x)'>
          <SettingRow
            label='Follow-up emails'
            description="Automatically send follow-up emails to investors who view but don't respond."
          >
            <Switch
              checked={form.followupEnabled}
              onCheckedChange={(checked: boolean) =>
                updateField('followupEnabled', checked)
              }
            />
          </SettingRow>

          <div className='grid gap-4 py-4 sm:grid-cols-3'>
            <DrawerFormField
              label='Follow-up delay (hours)'
              helperText='Hours to wait before sending follow-up'
            >
              <Input
                type='number'
                placeholder='48'
                value={form.followupDelayHours}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateField('followupDelayHours', e.target.value)
                }
                className='w-full'
              />
            </DrawerFormField>

            <DrawerFormField
              label='Engaged threshold'
              helperText='Engagement score (0-100) to mark investor as "engaged"'
            >
              <Input
                type='number'
                min='0'
                max='100'
                placeholder='50'
                value={form.engagedThreshold}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateField('engagedThreshold', e.target.value)
                }
                className='w-full'
              />
            </DrawerFormField>

            <DrawerFormField
              label='Slack webhook'
              helperText='Get notified when investors view your portal'
            >
              <Input
                type='url'
                placeholder='https://hooks.slack.com/services/...'
                value={form.slackWebhookUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateField('slackWebhookUrl', e.target.value)
                }
                className='w-full'
              />
            </DrawerFormField>
          </div>
        </div>
      </ContentSurfaceCard>

      {/* Save bar */}
      <div className='flex items-center justify-between'>
        <div>
          {error && (
            <DrawerSurfaceCard
              variant='card'
              className='flex items-center gap-2 border-destructive/20 bg-destructive/8 px-3 py-2'
            >
              <Icon
                name='XCircle'
                className='h-3.5 w-3.5 shrink-0 text-destructive'
              />
              <p className='text-xs font-medium text-destructive'>{error}</p>
            </DrawerSurfaceCard>
          )}
          {success && (
            <DrawerSurfaceCard
              variant='card'
              className='flex items-center gap-2 border-success/20 bg-success/8 px-3 py-2'
            >
              <Icon
                name='CheckCircle'
                className='h-3.5 w-3.5 shrink-0 text-success'
              />
              <p className='text-xs font-medium text-success'>Settings saved</p>
            </DrawerSurfaceCard>
          )}
        </div>
        <DrawerButton
          type='button'
          tone='primary'
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 className='mr-2 h-3.5 w-3.5 animate-spin' />
              Saving...
            </>
          ) : (
            <>
              <Save className='mr-2 h-3.5 w-3.5' />
              Save settings
            </>
          )}
        </DrawerButton>
      </div>
    </div>
  );
}
