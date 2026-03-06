'use client';

import { Checkbox } from '@jovie/ui';
import * as React from 'react';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className='mb-10'>
      <h2
        className='mb-4 text-[11px] font-semibold uppercase tracking-wider'
        style={{ color: 'var(--linear-text-tertiary)' }}
      >
        {title}
      </h2>
      <div className='flex flex-wrap items-center gap-6'>{children}</div>
    </div>
  );
}

function Stack({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className='flex flex-col gap-2'>
      <span
        className='text-[11px]'
        style={{ color: 'var(--linear-text-tertiary)' }}
      >
        {title}
      </span>
      <div className='flex items-center gap-3'>{children}</div>
    </div>
  );
}

export default function CheckboxesPage() {
  const [indeterminate, setIndeterminate] = React.useState(true);

  return (
    <div>
      <h1
        className='mb-1 text-lg font-semibold'
        style={{ color: 'var(--linear-text-primary)' }}
      >
        Checkbox
      </h1>
      <p
        className='mb-8 text-[13px]'
        style={{ color: 'var(--linear-text-tertiary)' }}
      >
        Matches Linear.app — 16px, 4px radius, primary-bg when checked, 2.5
        stroke check
      </p>

      {/* States */}
      <Section title='States'>
        <Stack title='unchecked'>
          <Checkbox />
        </Stack>
        <Stack title='checked'>
          <Checkbox defaultChecked />
        </Stack>
        <Stack title='indeterminate'>
          <Checkbox
            checked={indeterminate ? 'indeterminate' : false}
            onCheckedChange={() => setIndeterminate(prev => !prev)}
          />
        </Stack>
        <Stack title='disabled unchecked'>
          <Checkbox disabled />
        </Stack>
        <Stack title='disabled checked'>
          <Checkbox disabled defaultChecked />
        </Stack>
      </Section>

      {/* With label */}
      <Section title='With Label'>
        <div className='flex items-center gap-2'>
          <Checkbox id='label-demo' />
          <label
            htmlFor='label-demo'
            className='text-[13px]'
            style={{ color: 'var(--linear-text-primary)' }}
          >
            Label text
          </label>
        </div>
      </Section>

      {/* Checkbox group */}
      <Section title='Checkbox Group (Filter List)'>
        <div className='flex flex-col gap-3'>
          {['Bug', 'Feature', 'Improvement', 'Task'].map(item => (
            <div key={item} className='flex items-center gap-2'>
              <Checkbox id={`filter-${item}`} />
              <label
                htmlFor={`filter-${item}`}
                className='text-[13px]'
                style={{ color: 'var(--linear-text-primary)' }}
              >
                {item}
              </label>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
