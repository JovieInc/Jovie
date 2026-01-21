import { LinearButton } from '@/components/atoms/LinearButton';
import { Container } from '@/components/site/Container';

export function FinalCTASection() {
  return (
    <section className='section-spacing-linear bg-base relative overflow-hidden'>
      <Container size='homepage'>
        <div className='mx-auto flex max-w-4xl flex-col gap-6 text-center lg:max-w-none lg:flex-row lg:items-center lg:justify-between lg:text-left'>
          <div className='flex flex-col gap-6'>
            <h2 className='text-primary-token text-[32px] leading-[38px] tracking-[-0.88px] font-[510] sm:text-[40px] sm:leading-[44px]'>
              Ready to capture every fan?
            </h2>
          </div>

          <div className='flex justify-center lg:justify-end'>
            <LinearButton
              variant='primary'
              href='/waitlist'
              className='h-10 rounded-[10px] px-4 text-[15px] leading-[40px] font-[510] tracking-[0px]! bg-[#e6e6e6] text-[#08090a] border border-[#e6e6e6] shadow-[0_8px_2px_0_rgba(0,0,0,0),0_5px_2px_0_rgba(0,0,0,0.01),0_3px_2px_0_rgba(0,0,0,0.04),0_1px_1px_0_rgba(0,0,0,0.07),0_0_1px_0_rgba(0,0,0,0.08)] hover:opacity-90'
            >
              Request early access
            </LinearButton>
          </div>
        </div>
      </Container>
    </section>
  );
}
