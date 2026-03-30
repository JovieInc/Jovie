'use client';

import { Input, Switch } from '@jovie/ui';
import { Loader2, Save, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  DrawerButton,
  DrawerFormField,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';

interface PixelSettings {
  facebookPixelId: string | null;
  googleMeasurementId: string | null;
  tiktokPixelId: string | null;
  enabled: boolean;
  facebookEnabled: boolean;
  googleEnabled: boolean;
  tiktokEnabled: boolean;
}

interface HasTokens {
  facebook: boolean;
  google: boolean;
  tiktok: boolean;
}

interface FormState {
  facebookPixelId: string;
  facebookAccessToken: string;
  googleMeasurementId: string;
  googleApiSecret: string;
  tiktokPixelId: string;
  tiktokAccessToken: string;
  enabled: boolean;
}

const DEFAULT_FORM: FormState = {
  facebookPixelId: '',
  facebookAccessToken: '',
  googleMeasurementId: '',
  googleApiSecret: '',
  tiktokPixelId: '',
  tiktokAccessToken: '',
  enabled: true,
};

function PixelSection({
  title,
  icon,
  children,
}: {
  readonly title: string;
  readonly icon: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  return (
    <ContentSurfaceCard surface='nested' className='space-y-4 p-4'>
      <div className='flex items-center gap-2'>
        {icon}
        <p className='text-[14px] font-[560] text-primary-token'>{title}</p>
      </div>
      {children}
    </ContentSurfaceCard>
  );
}

export function AdPixelsContent() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [hasTokens, setHasTokens] = useState<HasTokens>({
    facebook: false,
    google: false,
    tiktok: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/pixels');
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch pixel settings');
      const data = await res.json();
      const pixels: PixelSettings = data.pixels;
      setHasTokens(
        data.hasTokens ?? { facebook: false, google: false, tiktok: false }
      );
      setForm({
        facebookPixelId: pixels.facebookPixelId ?? '',
        facebookAccessToken: '',
        googleMeasurementId: pixels.googleMeasurementId ?? '',
        googleApiSecret: '',
        tiktokPixelId: pixels.tiktokPixelId ?? '',
        tiktokAccessToken: '',
        enabled: pixels.enabled,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load pixel settings'
      );
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
      const res = await fetch('/api/dashboard/pixels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || `Failed to save settings (${res.status})`
        );
      }

      setSuccess(true);
      // Update token presence indicators
      setHasTokens({
        facebook: hasTokens.facebook || !!form.facebookAccessToken,
        google: hasTokens.google || !!form.googleApiSecret,
        tiktok: hasTokens.tiktok || !!form.tiktokAccessToken,
      });
      // Clear token fields after save (they're encrypted server-side)
      setForm(prev => ({
        ...prev,
        facebookAccessToken: '',
        googleApiSecret: '',
        tiktokAccessToken: '',
      }));
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof FormState>(
    field: K,
    value: FormState[K]
  ) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className='space-y-3'>
        {Array.from({ length: 3 }, (_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders never reorder
            key={`skeleton-${i}`}
            className='h-24 animate-pulse rounded-lg bg-surface-0'
          />
        ))}
      </div>
    );
  }

  if (forbidden) {
    return (
      <ContentSurfaceCard surface='nested' className='p-6 text-center'>
        <ShieldCheck className='mx-auto h-8 w-8 text-tertiary-token' />
        <p className='mt-3 text-[14px] font-[560] text-primary-token'>
          Pro feature
        </p>
        <p className='mt-1 text-[13px] text-secondary-token'>
          Ad pixels require a Pro plan. Upgrade to unlock retargeting across
          Facebook, Google, and TikTok.
        </p>
      </ContentSurfaceCard>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Master toggle */}
      <div className='flex items-center justify-between rounded-lg border border-subtle bg-surface-0 px-4 py-3'>
        <div>
          <p className='text-[13px] font-[560] text-primary-token'>
            Enable ad pixels
          </p>
          <p className='text-[12px] text-secondary-token'>
            Fire conversion events when fans visit your profile
          </p>
        </div>
        <Switch
          checked={form.enabled}
          onCheckedChange={(checked: boolean) =>
            updateField('enabled', checked)
          }
        />
      </div>

      {/* Facebook */}
      <PixelSection
        title='Facebook / Meta Pixel'
        icon={
          <div className='flex h-6 w-6 items-center justify-center rounded bg-[#1877F2] text-white text-[10px] font-bold'>
            f
          </div>
        }
      >
        <DrawerFormField label='Pixel ID' helperText='Your Facebook Pixel ID'>
          <Input
            type='text'
            placeholder='123456789012345'
            value={form.facebookPixelId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateField('facebookPixelId', e.target.value)
            }
            className='w-full'
          />
        </DrawerFormField>
        <DrawerFormField
          label='Conversions API Access Token'
          helperText={
            hasTokens.facebook
              ? 'Token is configured. Leave blank to keep current token.'
              : 'Required for server-side event tracking.'
          }
        >
          <Input
            type='password'
            placeholder={hasTokens.facebook ? '••••••••' : 'EAABsbCS...'}
            value={form.facebookAccessToken}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateField('facebookAccessToken', e.target.value)
            }
            className='w-full'
          />
        </DrawerFormField>
      </PixelSection>

      {/* Google */}
      <PixelSection
        title='Google Analytics / GA4'
        icon={
          <div className='flex h-6 w-6 items-center justify-center rounded bg-[#F4B400] text-white text-[10px] font-bold'>
            G
          </div>
        }
      >
        <DrawerFormField
          label='Measurement ID'
          helperText='Your GA4 Measurement ID (G-XXXXXXXXXX)'
        >
          <Input
            type='text'
            placeholder='G-XXXXXXXXXX'
            value={form.googleMeasurementId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateField('googleMeasurementId', e.target.value)
            }
            className='w-full'
          />
        </DrawerFormField>
        <DrawerFormField
          label='Measurement Protocol API Secret'
          helperText={
            hasTokens.google
              ? 'Secret is configured. Leave blank to keep current.'
              : 'Required for server-side event tracking.'
          }
        >
          <Input
            type='password'
            placeholder={hasTokens.google ? '••••••••' : 'Your API secret'}
            value={form.googleApiSecret}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateField('googleApiSecret', e.target.value)
            }
            className='w-full'
          />
        </DrawerFormField>
      </PixelSection>

      {/* TikTok */}
      <PixelSection
        title='TikTok Pixel'
        icon={
          <div className='flex h-6 w-6 items-center justify-center rounded bg-black text-white text-[10px] font-bold'>
            T
          </div>
        }
      >
        <DrawerFormField label='Pixel ID' helperText='Your TikTok Pixel ID'>
          <Input
            type='text'
            placeholder='CXXXXXXXXXXXXXXXXX'
            value={form.tiktokPixelId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateField('tiktokPixelId', e.target.value)
            }
            className='w-full'
          />
        </DrawerFormField>
        <DrawerFormField
          label='Events API Access Token'
          helperText={
            hasTokens.tiktok
              ? 'Token is configured. Leave blank to keep current.'
              : 'Required for server-side event tracking.'
          }
        >
          <Input
            type='password'
            placeholder={hasTokens.tiktok ? '••••••••' : 'Your access token'}
            value={form.tiktokAccessToken}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateField('tiktokAccessToken', e.target.value)
            }
            className='w-full'
          />
        </DrawerFormField>
      </PixelSection>

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
              <p className='text-xs font-medium text-success'>
                Pixel settings saved
              </p>
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
              Save pixel settings
            </>
          )}
        </DrawerButton>
      </div>
    </div>
  );
}
