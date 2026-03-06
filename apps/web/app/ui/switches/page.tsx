'use client';

import { Switch } from '@jovie/ui';

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='mb-10'>
      <h2
        className='mb-4 text-[11px] font-semibold uppercase tracking-wider'
        style={{ color: 'var(--linear-text-tertiary)' }}
      >
        {title}
      </h2>
      <div className='flex flex-wrap items-start gap-6'>{children}</div>
    </div>
  );
}

function Stack({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='flex flex-col gap-2'>
      <span
        className='text-[11px]'
        style={{ color: 'var(--linear-text-tertiary)' }}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

export default function SwitchesPage() {
  return (
    <div>
      <h1
        className='mb-1 text-lg font-semibold'
        style={{ color: 'var(--linear-text-primary)' }}
      >
        Switch
      </h1>
      <p
        className='mb-8 text-[13px]'
        style={{ color: 'var(--linear-text-tertiary)' }}
      >
        Matches Linear.app toggle — compact 28×16px track, smooth thumb
        transition
      </p>

      {/* Default states */}
      <Section title='Default States'>
        <Stack title='unchecked'>
          <Switch aria-label='Toggle unchecked' />
        </Stack>
        <Stack title='checked'>
          <Switch defaultChecked aria-label='Toggle checked' />
        </Stack>
        <Stack title='disabled unchecked'>
          <Switch disabled aria-label='Toggle disabled unchecked' />
        </Stack>
        <Stack title='disabled checked'>
          <Switch
            disabled
            defaultChecked
            aria-label='Toggle disabled checked'
          />
        </Stack>
      </Section>

      {/* With labels */}
      <Section title='With Labels'>
        <Stack title='Enable notifications'>
          <div className='flex items-center gap-3'>
            <Switch id='notifications' aria-label='Enable notifications' />
            <p
              className='text-[13px] font-[510]'
              style={{ color: 'var(--linear-text-primary)' }}
            >
              Enable notifications
            </p>
          </div>
        </Stack>
        <Stack title='Auto-assign issues'>
          <div className='flex items-center gap-3'>
            <Switch
              id='auto-assign'
              defaultChecked
              aria-label='Auto-assign issues'
            />
            <p
              className='text-[13px] font-[510]'
              style={{ color: 'var(--linear-text-primary)' }}
            >
              Auto-assign issues
            </p>
          </div>
        </Stack>
        <Stack title='disabled with label'>
          <div className='flex items-center gap-3'>
            <Switch disabled aria-label='Disabled setting' />
            <p
              className='text-[13px] font-[510] opacity-50'
              style={{ color: 'var(--linear-text-primary)' }}
            >
              Disabled setting
            </p>
          </div>
        </Stack>
      </Section>

      {/* In Context */}
      <Section title='In Context'>
        <Stack title='settings row'>
          <div
            className='flex w-64 flex-col divide-y rounded-lg border'
            style={{
              borderColor: 'var(--linear-border-subtle)',
            }}
          >
            {[
              { label: 'Slack notifications', checked: true },
              { label: 'Email digest', checked: false },
              { label: 'Desktop alerts', checked: true },
            ].map(item => (
              <div
                key={item.label}
                className='flex items-center justify-between px-4 py-3'
              >
                <p
                  className='text-[13px] font-[450]'
                  style={{ color: 'var(--linear-text-primary)' }}
                >
                  {item.label}
                </p>
                <Switch defaultChecked={item.checked} aria-label={item.label} />
              </div>
            ))}
          </div>
        </Stack>
      </Section>
    </div>
  );
}
