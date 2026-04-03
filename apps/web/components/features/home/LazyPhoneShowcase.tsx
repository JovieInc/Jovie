'use client';

import dynamic from 'next/dynamic';
import type { ModeData } from '@/features/home/phone-showcase-primitives';

function PhoneShowcaseSkeleton() {
  return (
    <div
      aria-hidden='true'
      className='w-full max-w-[21rem] rounded-[2.4rem] border border-subtle bg-surface-0/90 p-4 shadow-card-elevated'
    >
      <div className='rounded-[2rem] border border-subtle bg-surface-1 p-5'>
        <div className='mx-auto h-20 w-20 rounded-full bg-surface-2' />
        <div className='mx-auto mt-4 h-4 w-28 rounded-full bg-surface-2' />
        <div className='mx-auto mt-2 h-3 w-20 rounded-full bg-surface-2' />
        <div className='mt-6 space-y-3'>
          <div className='h-12 rounded-2xl bg-surface-2' />
          <div className='h-12 rounded-2xl bg-surface-2' />
          <div className='h-12 rounded-2xl bg-surface-2' />
          <div className='h-12 rounded-2xl bg-surface-2' />
        </div>
      </div>
    </div>
  );
}

const PhoneShowcase = dynamic(
  () =>
    import('@/features/home/phone-showcase-primitives').then(
      mod => mod.PhoneShowcase
    ),
  {
    ssr: false,
    loading: () => <PhoneShowcaseSkeleton />,
  }
);

interface LazyPhoneShowcaseProps {
  readonly modes: readonly ModeData[];
}

export function LazyPhoneShowcase({ modes }: LazyPhoneShowcaseProps) {
  return <PhoneShowcase modes={modes} />;
}
