'use client';

import { Input, InputGroup } from '@jovie/ui';
import { Search, X } from 'lucide-react';
import { useState } from 'react';

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='mb-10'>
      <h2 className='mb-4 text-[11px] font-semibold uppercase tracking-wider text-tertiary-token'>
        {title}
      </h2>
      <div className='flex flex-wrap items-center gap-3'>{children}</div>
    </div>
  );
}

function Label({ children }: { readonly children: React.ReactNode }) {
  return <span className='text-[11px] text-tertiary-token'>{children}</span>;
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
      <Label>{title}</Label>
      {children}
    </div>
  );
}

export default function InputsPage() {
  const [clearableValue, setClearableValue] = useState('Some text');

  return (
    <div>
      <h1 className='mb-1 text-lg font-semibold text-primary-token'>Input</h1>
      <p className='mb-8 text-[13px] text-tertiary-token'>
        Matches Linear.app — 32px height, 6px radius, surface-1 bg, border-focus
        on focus
      </p>

      {/* Default states */}
      <Section title='States'>
        <Stack title='placeholder'>
          <Input placeholder='Search releases...' className='w-64' />
        </Stack>
        <Stack title='with value'>
          <Input defaultValue='My Release Title' className='w-64' />
        </Stack>
        <Stack title='disabled'>
          <Input disabled placeholder='Disabled input' className='w-64' />
        </Stack>
        <Stack title='error'>
          <Input variant='error' defaultValue='bad-email' className='w-64' />
        </Stack>
      </Section>

      {/* With icons */}
      <Section title='With Icons (InputGroup)'>
        <Stack title='leading icon'>
          <InputGroup>
            <Search data-slot='icon' />
            <Input placeholder='Search...' className='w-64' />
          </InputGroup>
        </Stack>
        <Stack title='trailing icon (clearable)'>
          <InputGroup>
            <Input
              placeholder='Type something...'
              className='w-64'
              value={clearableValue}
              onChange={e => setClearableValue(e.target.value)}
            />
            {clearableValue && (
              <button
                type='button'
                className='absolute right-3 top-1/2 z-10 -translate-y-1/2 text-tertiary-token hover:text-primary-token transition-colors'
                onClick={() => setClearableValue('')}
                aria-label='Clear input'
              >
                <X className='size-3.5' />
              </button>
            )}
          </InputGroup>
        </Stack>
        <Stack title='both icons'>
          <InputGroup>
            <Search data-slot='icon' />
            <Input placeholder='Search releases...' className='w-64' />
            <X data-slot='icon' />
          </InputGroup>
        </Stack>
      </Section>

      {/* Sizes */}
      <Section title='Sizes'>
        <Stack title='sm (28px)'>
          <Input inputSize='sm' placeholder='Small' className='w-48' />
        </Stack>
        <Stack title='md / default (32px)'>
          <Input inputSize='md' placeholder='Medium' className='w-64' />
        </Stack>
        <Stack title='lg (40px)'>
          <Input inputSize='lg' placeholder='Large' className='w-64' />
        </Stack>
      </Section>

      {/* Widths */}
      <Section title='Widths'>
        <Stack title='w-48'>
          <Input placeholder='w-48' className='w-48' />
        </Stack>
        <Stack title='w-64'>
          <Input placeholder='w-64' className='w-64' />
        </Stack>
        <Stack title='w-full (container)'>
          <div className='w-80'>
            <Input placeholder='w-full inside w-80 container' />
          </div>
        </Stack>
      </Section>

      {/* With label and help text */}
      <Section title='With Label / Error / Help'>
        <Stack title='label + help'>
          <Input
            label='Release title'
            helpText='This appears on the release page'
            placeholder='Enter title...'
            className='w-64'
          />
        </Stack>
        <Stack title='label + error'>
          <Input
            label='Email'
            error='Please enter a valid email'
            defaultValue='not-an-email'
            className='w-64'
          />
        </Stack>
      </Section>
    </div>
  );
}
