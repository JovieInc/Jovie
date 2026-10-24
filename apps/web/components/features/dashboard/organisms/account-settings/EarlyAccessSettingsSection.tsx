'use client';

import { FlaskConical } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsToggleRow } from '@/components/molecules/settings/SettingsToggleRow';
import { useOptimisticToggle } from '@/features/dashboard/hooks/useOptimisticToggle';

const EARLY_ACCESS_API_PATH = '/api/account/early-access';

export function EarlyAccessSettingsSection() {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(EARLY_ACCESS_API_PATH, { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error('Unable to load early access.');
        return response.json();
      })
      .then(payload => {
        if (!active || !payload || typeof payload.enabled !== 'boolean') return;
        setEnabled(payload.enabled);
        setLoaded(true);
      })
      .catch(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const { checked, handleToggle, isPending } = useOptimisticToggle({
    initialValue: enabled,
    syncKey: loaded ? 'loaded' : 'loading',
    mutateAsync: async nextEnabled => {
      const response = await fetch(EARLY_ACCESS_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!response.ok) throw new Error('Unable to update early access.');
    },
    errorMessage: 'Could not update early-access settings. Please try again.',
  });

  return (
    <SettingsPanel
      title='Early access'
      description='Try eligible Jovie features before they are broadly available.'
      bodyClassName='px-4 py-4 sm:px-5'
    >
      <SettingsToggleRow
        icon={<FlaskConical className='h-4 w-4' aria-hidden />}
        title='Join the early-access cohort'
        description='I consent to receiving eligible Jovie features early. You can leave this cohort at any time; your choice is saved to your account.'
        checked={checked}
        onCheckedChange={handleToggle}
        disabled={!loaded || isPending}
        ariaLabel='Join or leave the Jovie early-access cohort'
      />
    </SettingsPanel>
  );
}
