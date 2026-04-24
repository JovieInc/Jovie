'use client';

import { Button } from '@jovie/ui';
import { ExternalLink, Terminal } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CampaignSettingsPanel } from '@/components/features/admin/campaigns/CampaignSettingsPanel';
import { WaitlistSettingsPanel } from '@/components/features/admin/WaitlistSettingsPanel';
import { adminSettingsNavigationSections } from '@/components/features/dashboard/dashboard-nav/config';
import { SettingsActionRow } from '@/components/molecules/settings/SettingsActionRow';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsToggleRow } from '@/components/molecules/settings/SettingsToggleRow';
import { APP_ROUTES } from '@/constants/routes';

const DEV_TOOLBAR_COOKIE = '__dev_toolbar';

function useDevToolbarCookie() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(document.cookie.includes(`${DEV_TOOLBAR_COOKIE}=1`));
  }, []);

  const toggle = (checked: boolean) => {
    if (checked) {
      document.cookie = `${DEV_TOOLBAR_COOKIE}=1; path=/; max-age=31536000; SameSite=Lax`;
    } else {
      document.cookie = `${DEV_TOOLBAR_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    }
    setEnabled(checked);
    globalThis.location.reload();
  };

  return { enabled, toggle };
}

interface AdminLinkProps {
  readonly href: string;
  readonly icon: React.ElementType;
  readonly title: string;
  readonly description: string;
}

function AdminLink({ href, icon: Icon, title, description }: AdminLinkProps) {
  return (
    <SettingsActionRow
      icon={<Icon className='h-4 w-4' aria-hidden />}
      title={title}
      description={description}
      action={
        <Button variant='outline' size='sm' asChild>
          <Link href={href}>
            Open
            <ExternalLink className='ml-1.5 h-3.5 w-3.5' />
          </Link>
        </Button>
      }
    />
  );
}

const quickLinkSections = adminSettingsNavigationSections;

export function SettingsAdminSection() {
  const devToolbar = useDevToolbarCookie();

  return (
    <div className='space-y-6'>
      <SettingsPanel
        title='Platform & Environment'
        description='Set durable admin defaults here, then move into the operator workspaces when it is time to run them.'
      >
        <div className='px-4 py-4 sm:px-5'>
          <SettingsToggleRow
            icon={<Terminal className='h-4 w-4' aria-hidden />}
            title='Dev toolbar'
            description='Show the toolbar with feature-flag overrides and environment details.'
            checked={devToolbar.enabled}
            onCheckedChange={devToolbar.toggle}
            ariaLabel='Toggle dev toolbar'
          />
        </div>
      </SettingsPanel>

      <WaitlistSettingsPanel />
      <CampaignSettingsPanel />

      <SettingsPanel
        title='Admin Workspaces'
        description='Jump into the admin surfaces once the defaults above are set.'
        actions={
          <Button size='sm' variant='outline' asChild>
            <Link href={APP_ROUTES.ADMIN_GROWTH}>
              Open Growth Ops
              <ExternalLink className='ml-1.5 h-3.5 w-3.5' />
            </Link>
          </Button>
        }
      >
        <div className='space-y-4 px-4 py-4 sm:px-5'>
          {quickLinkSections.map(section => (
            <div key={section.label} className='space-y-2'>
              <p className='text-2xs uppercase tracking-[0.08em] text-tertiary-token'>
                {section.label}
              </p>
              <div className='divide-y divide-subtle/60'>
                {section.items.map(item => (
                  <AdminLink
                    key={item.id}
                    href={item.href}
                    icon={item.icon}
                    title={item.name}
                    description={item.description ?? 'Open admin workspace'}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </SettingsPanel>
    </div>
  );
}
