import { Textarea } from '@jovie/ui';
import type React from 'react';

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

export default function TextareasPage() {
  return (
    <div>
      <h1
        className='mb-1 text-lg font-semibold'
        style={{ color: 'var(--linear-text-primary)' }}
      >
        Textarea
      </h1>
      <p
        className='mb-8 text-[13px]'
        style={{ color: 'var(--linear-text-tertiary)' }}
      >
        Matches Linear.app — 13px, weight 450, linear border tokens, focus
        border only
      </p>

      <Section title='Default States'>
        <Stack title='placeholder'>
          <Textarea placeholder='Write something...' className='w-64' />
        </Stack>
        <Stack title='with value'>
          <Textarea
            defaultValue='This is some existing content in the textarea.'
            className='w-64'
          />
        </Stack>
        <Stack title='disabled'>
          <Textarea disabled placeholder='Disabled textarea' className='w-64' />
        </Stack>
      </Section>

      <Section title='Variants'>
        <Stack title='default'>
          <Textarea placeholder='Default variant' className='w-64' />
        </Stack>
        <Stack title='error'>
          <Textarea
            placeholder='Error variant'
            validationState='invalid'
            error='Required'
            className='w-64'
          />
        </Stack>
        <Stack title='success'>
          <Textarea
            defaultValue='Valid content here.'
            validationState='valid'
            className='w-64'
          />
        </Stack>
      </Section>

      <Section title='Sizes'>
        <Stack title='sm'>
          <Textarea
            placeholder='Small textarea'
            textareaSize='sm'
            className='w-48'
          />
        </Stack>
        <Stack title='md (default)'>
          <Textarea
            placeholder='Medium textarea'
            textareaSize='md'
            className='w-64'
          />
        </Stack>
        <Stack title='lg'>
          <Textarea
            placeholder='Large textarea'
            textareaSize='lg'
            className='w-80'
          />
        </Stack>
      </Section>

      <Section title='With Label'>
        <Stack title='label + help text'>
          <Textarea
            label='Description'
            helpText='Max 500 characters'
            placeholder='Enter a description...'
            className='w-64'
          />
        </Stack>
        <Stack title='label + error'>
          <Textarea
            label='Bio'
            error='Bio is required'
            placeholder='Tell us about yourself'
            className='w-64'
          />
        </Stack>
        <Stack title='label + required'>
          <Textarea
            label='Notes'
            required
            placeholder='Required field'
            className='w-64'
          />
        </Stack>
      </Section>

      <Section title='Resizable vs Fixed'>
        <Stack title='resizable (default)'>
          <Textarea
            resizable
            placeholder='Drag the corner to resize'
            className='w-64'
          />
        </Stack>
        <Stack title='fixed (resize-none)'>
          <Textarea
            resizable={false}
            placeholder='Cannot be resized'
            className='w-64'
          />
        </Stack>
      </Section>
    </div>
  );
}
