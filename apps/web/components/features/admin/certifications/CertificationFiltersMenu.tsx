'use client';

import { Button } from '@jovie/ui';
import { SlidersHorizontal } from 'lucide-react';
import { PAGE_TOOLBAR_MENU_TRIGGER_CLASS } from '@/components/organisms/table';
import { ShellDropdown } from '@/components/shell/ShellDropdown';
import {
  OVIE_CERTIFICATION_DOMAIN_LABELS,
  type OvieCertificationDomainSummary,
  type OvieCertificationRow,
} from '@/lib/ovie/certifications/types';
import type {
  CertificationBlockerFilter,
  CertificationDomainFilter,
  CertificationFreshnessFilter,
} from './certification-view';

export function CertificationFiltersMenu({
  rows,
  domains,
  domain,
  onDomainChange,
  owner,
  onOwnerChange,
  freshness,
  onFreshnessChange,
  blockers,
  onBlockersChange,
}: {
  readonly rows: readonly OvieCertificationRow[];
  readonly domains: readonly OvieCertificationDomainSummary[];
  readonly domain: CertificationDomainFilter;
  readonly onDomainChange: (value: CertificationDomainFilter) => void;
  readonly owner: string;
  readonly onOwnerChange: (value: string) => void;
  readonly freshness: CertificationFreshnessFilter;
  readonly onFreshnessChange: (value: CertificationFreshnessFilter) => void;
  readonly blockers: CertificationBlockerFilter;
  readonly onBlockersChange: (value: CertificationBlockerFilter) => void;
}) {
  const owners = [
    ...new Set(rows.flatMap(row => (row.owner ? [row.owner] : []))),
  ].sort();
  const count =
    Number(domain !== 'all') +
    Number(owner !== 'all') +
    Number(freshness !== 'all') +
    Number(blockers !== 'all');
  return (
    <ShellDropdown
      align='end'
      width={280}
      trigger={
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className={PAGE_TOOLBAR_MENU_TRIGGER_CLASS}
          aria-label='Certification Filters'
        >
          <SlidersHorizontal className='h-3 w-3' aria-hidden='true' />
          <span className='max-w-40 truncate'>
            {domain === 'all'
              ? 'Filters'
              : OVIE_CERTIFICATION_DOMAIN_LABELS[domain]}
          </span>
          {count ? ` (${count})` : ''}
        </Button>
      }
    >
      <ShellDropdown.Label>Domain</ShellDropdown.Label>
      <ShellDropdown.RadioGroup
        value={domain}
        onValueChange={value =>
          onDomainChange(value as CertificationDomainFilter)
        }
      >
        <ShellDropdown.RadioItem value='all' label='All Domains' />
        {domains.map(item => (
          <ShellDropdown.RadioItem
            key={item.domain}
            value={item.domain}
            label={`${item.label} (${item.status === 'not_connected' ? 'Unavailable' : item.rowCount})`}
            disabled={item.status === 'not_connected'}
          />
        ))}
      </ShellDropdown.RadioGroup>
      <ShellDropdown.Label>Owner</ShellDropdown.Label>
      <ShellDropdown.RadioGroup value={owner} onValueChange={onOwnerChange}>
        <ShellDropdown.RadioItem value='all' label='All Owners' />
        <ShellDropdown.RadioItem value='unassigned' label='Unassigned' />
        {owners.map(value => (
          <ShellDropdown.RadioItem key={value} value={value} label={value} />
        ))}
      </ShellDropdown.RadioGroup>
      <ShellDropdown.Label>Evidence Freshness</ShellDropdown.Label>
      <ShellDropdown.RadioGroup
        value={freshness}
        onValueChange={value =>
          onFreshnessChange(value as CertificationFreshnessFilter)
        }
      >
        <ShellDropdown.RadioItem value='all' label='All Evidence' />
        <ShellDropdown.RadioItem value='current' label='Current Revision' />
        <ShellDropdown.RadioItem value='stale' label='Stale Revision' />
        <ShellDropdown.RadioItem value='missing' label='Missing Evidence' />
      </ShellDropdown.RadioGroup>
      <ShellDropdown.Label>Blockers</ShellDropdown.Label>
      <ShellDropdown.RadioGroup
        value={blockers}
        onValueChange={value =>
          onBlockersChange(value as CertificationBlockerFilter)
        }
      >
        <ShellDropdown.RadioItem value='all' label='All Items' />
        <ShellDropdown.RadioItem value='blocked' label='Has Blockers' />
        <ShellDropdown.RadioItem value='clear' label='No Blockers' />
      </ShellDropdown.RadioGroup>
    </ShellDropdown>
  );
}
