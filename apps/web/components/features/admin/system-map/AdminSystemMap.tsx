import { Cable, Database, Wrench } from 'lucide-react';
import type { SystemMapTab } from '@/app/app/(shell)/admin/system/page';
import { SKILL_REGISTRY } from '@/lib/agents/registry';
import { getConnectorDefinitions } from '@/lib/connectors/registry';
import { AdminSystemMapSkillsTab } from './AdminSystemMapSkillsTab';

interface AdminSystemMapProps {
  readonly activeTab: SystemMapTab;
}

export async function AdminSystemMap({ activeTab }: AdminSystemMapProps) {
  if (activeTab === 'skills') {
    return <AdminSystemMapSkillsTab />;
  }

  if (activeTab === 'connectors') {
    const connectors = getConnectorDefinitions();
    return (
      <div data-testid='system-map-connectors' className='space-y-3'>
        {connectors.map(c => (
          <div
            key={c.id}
            className='flex items-start gap-3 rounded-lg border border-subtle bg-surface-1 p-4'
          >
            <Cable className='mt-0.5 h-4 w-4 shrink-0 text-secondary-token' />
            <div className='min-w-0'>
              <p className='text-sm font-medium text-primary-token'>
                {c.label}
              </p>
              <p className='mt-0.5 text-xs text-secondary-token'>
                {c.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activeTab === 'tools') {
    const tools = Object.values(SKILL_REGISTRY).filter(s => s.kind === 'tool');
    return (
      <div data-testid='system-map-tools' className='space-y-3'>
        {tools.length === 0 ? (
          <p className='text-sm text-secondary-token'>No tools registered.</p>
        ) : (
          tools.map(t => (
            <div
              key={t.id}
              className='flex items-start gap-3 rounded-lg border border-subtle bg-surface-1 p-4'
            >
              <Wrench className='mt-0.5 h-4 w-4 shrink-0 text-secondary-token' />
              <div className='min-w-0'>
                <p className='text-sm font-medium text-primary-token'>
                  {t.name}
                </p>
                <p className='mt-0.5 text-xs text-secondary-token'>
                  {t.description}
                </p>
                <p className='mt-1 font-mono text-2xs text-tertiary-token'>
                  {t.model}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // memory tab
  const memoryEntityTypes = [
    'person',
    'artist',
    'song',
    'location',
    'studio',
    'company',
    'event',
    'project',
    'asset',
    'file',
    'release',
    'recording',
  ] as const;

  return (
    <div data-testid='system-map-memory' className='space-y-3'>
      <p className='text-xs text-secondary-token'>
        Entity types tracked in the memory graph (memory.ts — JOV-10370).
      </p>
      <div className='flex flex-wrap gap-2'>
        {memoryEntityTypes.map(type => (
          <span
            key={type}
            className='inline-flex items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 py-1 text-xs text-primary-token'
          >
            <Database
              className='h-3 w-3 text-secondary-token'
              aria-hidden='true'
            />
            {type}
          </span>
        ))}
      </div>
    </div>
  );
}
