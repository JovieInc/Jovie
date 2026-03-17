import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarStatusDot,
  UserAvatar,
} from '@jovie/ui';
import type { ReactNode } from 'react';

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className='mb-10'>
      <h2 className='mb-4 text-[11px] font-semibold uppercase tracking-wider text-tertiary-token'>
        {title}
      </h2>
      <div className='flex flex-wrap items-end gap-6'>{children}</div>
    </div>
  );
}

function Stack({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className='flex flex-col items-center gap-2'>
      <div>{children}</div>
      <span className='text-[11px] text-tertiary-token'>{title}</span>
    </div>
  );
}

export default function AvatarsPage() {
  return (
    <div>
      <h1 className='mb-1 text-lg font-semibold text-primary-token'>Avatar</h1>
      <p className='mb-8 text-[13px] text-tertiary-token'>
        Matches Linear.app — circular, 5 sizes, image+fallback, status dot
      </p>

      {/* Sizes — with image */}
      <Section title='Sizes — with image'>
        <Stack title='xs (16px)'>
          <UserAvatar
            src='https://i.pravatar.cc/40?img=1'
            name='Alice Baker'
            size='xs'
          />
        </Stack>
        <Stack title='sm (20px)'>
          <UserAvatar
            src='https://i.pravatar.cc/40?img=2'
            name='Bob Chen'
            size='sm'
          />
        </Stack>
        <Stack title='md (24px)'>
          <UserAvatar
            src='https://i.pravatar.cc/40?img=3'
            name='Carol Diaz'
            size='md'
          />
        </Stack>
        <Stack title='lg (32px)'>
          <UserAvatar
            src='https://i.pravatar.cc/40?img=4'
            name='Dan Evans'
            size='lg'
          />
        </Stack>
        <Stack title='xl (40px)'>
          <UserAvatar
            src='https://i.pravatar.cc/40?img=5'
            name='Eve Foster'
            size='xl'
          />
        </Stack>
      </Section>

      {/* Sizes — initials fallback */}
      <Section title='Sizes — initials fallback'>
        <Stack title='xs'>
          <UserAvatar name='Alice Baker' size='xs' />
        </Stack>
        <Stack title='sm'>
          <UserAvatar name='Bob Chen' size='sm' />
        </Stack>
        <Stack title='md'>
          <UserAvatar name='Carol Diaz' size='md' />
        </Stack>
        <Stack title='lg'>
          <UserAvatar name='Dan Evans' size='lg' />
        </Stack>
        <Stack title='xl'>
          <UserAvatar name='Eve Foster' size='xl' />
        </Stack>
        <Stack title='no name'>
          <UserAvatar size='md' />
        </Stack>
      </Section>

      {/* Status indicators */}
      <Section title='Status indicators'>
        <Stack title='online'>
          <UserAvatar
            src='https://i.pravatar.cc/40?img=6'
            name='Frank Green'
            size='lg'
            status='online'
          />
        </Stack>
        <Stack title='away'>
          <UserAvatar
            src='https://i.pravatar.cc/40?img=7'
            name='Grace Hill'
            size='lg'
            status='away'
          />
        </Stack>
        <Stack title='offline'>
          <UserAvatar
            src='https://i.pravatar.cc/40?img=8'
            name='Hank Irwin'
            size='lg'
            status='offline'
          />
        </Stack>
        <Stack title='fallback + online'>
          <UserAvatar name='Jane Kim' size='lg' status='online' />
        </Stack>
        <Stack title='fallback + away'>
          <UserAvatar name='Leo Marsh' size='lg' status='away' />
        </Stack>
      </Section>

      {/* Status on all sizes */}
      <Section title='Status — across sizes'>
        <Stack title='xs + online'>
          <UserAvatar name='A B' size='xs' status='online' />
        </Stack>
        <Stack title='sm + online'>
          <UserAvatar name='A B' size='sm' status='online' />
        </Stack>
        <Stack title='md + online'>
          <UserAvatar name='A B' size='md' status='online' />
        </Stack>
        <Stack title='lg + online'>
          <UserAvatar name='A B' size='lg' status='online' />
        </Stack>
        <Stack title='xl + online'>
          <UserAvatar name='A B' size='xl' status='online' />
        </Stack>
      </Section>

      {/* Stacked / group */}
      <Section title='Stacked group'>
        <Stack title='-space-x-2 with ring'>
          <div className='flex -space-x-2'>
            <UserAvatar
              src='https://i.pravatar.cc/40?img=10'
              name='User One'
              size='md'
              ring
            />
            <UserAvatar
              src='https://i.pravatar.cc/40?img=11'
              name='User Two'
              size='md'
              ring
            />
            <UserAvatar
              src='https://i.pravatar.cc/40?img=12'
              name='User Three'
              size='md'
              ring
            />
            <UserAvatar name='User Four' size='md' ring />
            <UserAvatar name='User Five' size='md' ring />
          </div>
        </Stack>
        <Stack title='lg stacked'>
          <div className='flex -space-x-3'>
            <UserAvatar
              src='https://i.pravatar.cc/40?img=13'
              name='A B'
              size='lg'
              ring
            />
            <UserAvatar
              src='https://i.pravatar.cc/40?img=14'
              name='C D'
              size='lg'
              ring
            />
            <UserAvatar name='E F' size='lg' ring />
          </div>
        </Stack>
      </Section>

      {/* Primitives */}
      <Section title='Primitives (Avatar + AvatarImage + AvatarFallback)'>
        <Stack title='composed with image'>
          <Avatar size='lg'>
            <AvatarImage
              src='https://i.pravatar.cc/40?img=20'
              alt='Example user'
            />
            <AvatarFallback size='lg'>EU</AvatarFallback>
          </Avatar>
        </Stack>
        <Stack title='composed fallback only'>
          <Avatar size='lg'>
            <AvatarFallback size='lg'>MN</AvatarFallback>
          </Avatar>
        </Stack>
        <Stack title='with status dot'>
          <Avatar size='xl'>
            <AvatarImage
              src='https://i.pravatar.cc/40?img=21'
              alt='Status demo'
            />
            <AvatarStatusDot status='online' size='xl' />
          </Avatar>
        </Stack>
      </Section>
    </div>
  );
}
