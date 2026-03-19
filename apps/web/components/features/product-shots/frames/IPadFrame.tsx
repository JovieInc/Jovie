import type { ReactNode } from 'react';

export function IPadFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div
      className='inline-flex rounded-[18px] border-[10px] border-[#1a1a1a] bg-[#1a1a1a]'
      style={{
        boxShadow:
          '0 20px 60px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)',
      }}
    >
      {/* Camera dot (top center in landscape) */}
      <div className='relative overflow-hidden rounded-[8px]'>
        <div className='pointer-events-none absolute top-[6px] left-1/2 z-10 -translate-x-1/2'>
          <div className='h-[5px] w-[5px] rounded-full bg-[#2a2a2a] ring-1 ring-[#3a3a3a]' />
        </div>
        {children}
      </div>
    </div>
  );
}
