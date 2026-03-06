import { Badge } from '@jovie/ui';
import { Circle } from 'lucide-react';

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
        className='mb-4 text-[11px] font-semibold uppercase tracking-wider text-(--linear-text-tertiary)'
      >
        {title}
      </h2>
      <div className='flex flex-wrap items-center gap-3'>{children}</div>
    </div>
  );
}

function Label({ children }: { readonly children: React.ReactNode }) {
  return (
    <span className='text-[11px] text-(--linear-text-tertiary)'>
      {children}
    </span>
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
    <div className='flex flex-col items-start gap-2'>
      <Label>{title}</Label>
      <div className='flex items-center gap-2'>{children}</div>
    </div>
  );
}

export default function BadgesPage() {
  return (
    <div>
      <h1 className='mb-1 text-lg font-semibold text-(--linear-text-primary)'>
        Badge
      </h1>
      <p className='mb-8 text-[13px] text-(--linear-text-tertiary)'>
        Matches Linear.app — 11px text, weight 510, pill shape, semantic color
        variants
      </p>

      <Section title='Variants'>
        <Stack title='default'>
          <Badge variant='default'>Default</Badge>
        </Stack>
        <Stack title='secondary'>
          <Badge variant='secondary'>Secondary</Badge>
        </Stack>
        <Stack title='success'>
          <Badge variant='success'>Active</Badge>
        </Stack>
        <Stack title='warning'>
          <Badge variant='warning'>Pending</Badge>
        </Stack>
        <Stack title='destructive'>
          <Badge variant='destructive'>Error</Badge>
        </Stack>
        <Stack title='outline'>
          <Badge variant='outline'>Draft</Badge>
        </Stack>
      </Section>

      <Section title='Sizes'>
        <Stack title='sm'>
          <Badge variant='default' size='sm'>
            Small
          </Badge>
        </Stack>
        <Stack title='md (default)'>
          <Badge variant='default' size='md'>
            Medium
          </Badge>
        </Stack>
        <Stack title='lg'>
          <Badge variant='default' size='lg'>
            Large
          </Badge>
        </Stack>
      </Section>

      <Section title='With status dot'>
        <Stack title='active'>
          <Badge variant='success'>
            <Circle className='h-1.5 w-1.5 fill-current' />
            Active
          </Badge>
        </Stack>
        <Stack title='pending'>
          <Badge variant='warning'>
            <Circle className='h-1.5 w-1.5 fill-current' />
            Pending
          </Badge>
        </Stack>
        <Stack title='failed'>
          <Badge variant='destructive'>
            <Circle className='h-1.5 w-1.5 fill-current' />
            Failed
          </Badge>
        </Stack>
      </Section>

      <Section title='In context — mock table row'>
        <div
          className='w-full max-w-lg rounded-lg border px-4 py-3'
          style={{
            borderColor: 'var(--linear-border-subtle)',
            backgroundColor: 'var(--linear-bg-surface-0)',
          }}
        >
          <div className='flex items-center justify-between'>
            <span
              className='text-[13px]'
              style={{ color: 'var(--linear-text-primary)' }}
            >
              Midnight Rain — Single
            </span>
            <div className='flex items-center gap-2'>
              <Badge variant='success' size='sm'>
                Published
              </Badge>
              <Badge variant='outline' size='sm'>
                Spotify
              </Badge>
            </div>
          </div>
          <div className='mt-1 flex items-center gap-2'>
            <Badge variant='secondary' size='sm'>
              Hip-Hop
            </Badge>
            <Badge variant='secondary' size='sm'>
              R&amp;B
            </Badge>
            <span
              className='text-[11px]'
              style={{ color: 'var(--linear-text-tertiary)' }}
            >
              2 days ago
            </span>
          </div>
        </div>
      </Section>
    </div>
  );
}
