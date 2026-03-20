import type { ReactNode } from 'react';

export function IPhoneFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div
      className='relative inline-flex rounded-[40px] border-[6px] border-[#1a1a1a] bg-[#1a1a1a] p-[2px]'
      style={{
        boxShadow:
          '0 20px 60px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.1)',
      }}
    >
      {/* Side button (right) */}
      <div className='absolute -right-[8px] top-[120px] h-[60px] w-[3px] rounded-r bg-[#2a2a2a]' />
      {/* Volume buttons (left) */}
      <div className='absolute -left-[8px] top-[100px] h-[28px] w-[3px] rounded-l bg-[#2a2a2a]' />
      <div className='absolute -left-[8px] top-[140px] h-[28px] w-[3px] rounded-l bg-[#2a2a2a]' />

      <div className='relative overflow-hidden rounded-[34px]'>
        {/* Dynamic Island */}
        <div className='pointer-events-none absolute top-[10px] left-1/2 z-10 -translate-x-1/2'>
          <div className='h-[25px] w-[90px] rounded-full bg-black' />
        </div>
        {/* Screen content */}
        {children}
      </div>
    </div>
  );
}
