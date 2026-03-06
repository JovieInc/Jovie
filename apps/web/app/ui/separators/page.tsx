import { Separator } from '@jovie/ui';
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

export default function SeparatorsPage() {
  return (
    <div>
      <h1
        className='mb-1 text-lg font-semibold'
        style={{ color: 'var(--linear-text-primary)' }}
      >
        Separator
      </h1>
      <p
        className='mb-8 text-[13px]'
        style={{ color: 'var(--linear-text-tertiary)' }}
      >
        Visual or semantic divider using Linear border-subtle token
      </p>

      <Section title='Horizontal Separators'>
        <Stack title='between list items'>
          <div
            className='w-72 rounded-lg border p-4'
            style={{
              borderColor: 'var(--linear-border-subtle)',
              backgroundColor: 'var(--linear-bg-surface-1)',
            }}
          >
            <div
              className='py-2 text-[13px]'
              style={{ color: 'var(--linear-text-primary)' }}
            >
              First item
            </div>
            <Separator />
            <div
              className='py-2 text-[13px]'
              style={{ color: 'var(--linear-text-primary)' }}
            >
              Second item
            </div>
            <Separator />
            <div
              className='py-2 text-[13px]'
              style={{ color: 'var(--linear-text-primary)' }}
            >
              Third item
            </div>
          </div>
        </Stack>
        <Stack title='standalone horizontal'>
          <div className='w-72'>
            <Separator />
          </div>
        </Stack>
      </Section>

      <Section title='Vertical Separator'>
        <Stack title='between inline content'>
          <div className='flex items-center gap-3'>
            <span
              className='text-[13px]'
              style={{ color: 'var(--linear-text-primary)' }}
            >
              Left content
            </span>
            <Separator orientation='vertical' className='h-4' />
            <span
              className='text-[13px]'
              style={{ color: 'var(--linear-text-secondary)' }}
            >
              Right content
            </span>
          </div>
        </Stack>
        <Stack title='in a toolbar'>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              className='rounded px-2 py-1 text-[12px]'
              style={{
                color: 'var(--linear-text-primary)',
                backgroundColor: 'var(--linear-bg-surface-1)',
              }}
            >
              Bold
            </button>
            <button
              type='button'
              className='rounded px-2 py-1 text-[12px]'
              style={{
                color: 'var(--linear-text-primary)',
                backgroundColor: 'var(--linear-bg-surface-1)',
              }}
            >
              Italic
            </button>
            <Separator orientation='vertical' className='h-5' />
            <button
              type='button'
              className='rounded px-2 py-1 text-[12px]'
              style={{
                color: 'var(--linear-text-primary)',
                backgroundColor: 'var(--linear-bg-surface-1)',
              }}
            >
              Link
            </button>
          </div>
        </Stack>
      </Section>

      <Section title='Section Divider in Card'>
        <Stack title='card with sections'>
          <div
            className='w-80 rounded-lg border'
            style={{
              borderColor: 'var(--linear-border-subtle)',
              backgroundColor: 'var(--linear-bg-surface-1)',
            }}
          >
            <div className='p-4'>
              <p
                className='text-[12px] font-medium uppercase tracking-wider'
                style={{ color: 'var(--linear-text-tertiary)' }}
              >
                Details
              </p>
              <p
                className='mt-1 text-[13px]'
                style={{ color: 'var(--linear-text-primary)' }}
              >
                Release metadata and settings
              </p>
            </div>
            <Separator />
            <div className='p-4'>
              <p
                className='text-[12px] font-medium uppercase tracking-wider'
                style={{ color: 'var(--linear-text-tertiary)' }}
              >
                Actions
              </p>
              <p
                className='mt-1 text-[13px]'
                style={{ color: 'var(--linear-text-primary)' }}
              >
                Publish, archive, or delete this release
              </p>
            </div>
            <Separator />
            <div className='p-4'>
              <p
                className='text-[12px] font-medium uppercase tracking-wider'
                style={{ color: 'var(--linear-text-tertiary)' }}
              >
                Danger Zone
              </p>
              <p
                className='mt-1 text-[13px]'
                style={{ color: 'var(--linear-error)' }}
              >
                Permanently delete this release
              </p>
            </div>
          </div>
        </Stack>
      </Section>
    </div>
  );
}
