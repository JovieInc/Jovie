import type { ReactNode } from 'react';

export function MacBookFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div className='inline-flex flex-col items-center'>
      {/* Screen bezel */}
      <div
        className='rounded-t-xl border-[8px] border-[#2d2d2d] bg-[#2d2d2d] shadow-2xl'
        style={{
          boxShadow:
            '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        }}
      >
        {/* Camera notch */}
        <div className='flex justify-center pb-1'>
          <div className='h-[4px] w-[4px] rounded-full bg-[#1a1a1a] ring-1 ring-[#3a3a3a]' />
        </div>
        {/* Screen content */}
        <div className='overflow-hidden rounded-[2px]'>{children}</div>
      </div>
      {/* Bottom chin / hinge */}
      <div
        className='h-[12px] w-[110%] rounded-b-lg bg-gradient-to-b from-[#c0c0c0] to-[#a0a0a0]'
        style={{
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      />
      {/* Base */}
      <div className='h-[4px] w-[35%] rounded-b-sm bg-gradient-to-b from-[#b0b0b0] to-[#909090]' />
    </div>
  );
}
