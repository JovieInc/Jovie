import { MarketingContainer } from '@/components/marketing';

const SUPPORT_CHANNEL_KEYS = ['email', 'docs', 'response-time'] as const;
const SUPPORT_FAQ_KEYS = ['faq-1', 'faq-2', 'faq-3', 'faq-4'] as const;

export default function SupportLoading() {
  return (
    <div className='pt-16 pb-20 sm:pt-20 sm:pb-24 lg:pt-24 lg:pb-32'>
      <MarketingContainer width='page' className='flex flex-col items-start'>
        <div>
          <div className='h-4 w-16 skeleton rounded' />
          <div className='mt-6 h-12 w-64 skeleton rounded-lg' />
          <div className='mt-6 h-5 w-80 skeleton rounded' />
        </div>
      </MarketingContainer>

      <MarketingContainer width='prose' className='mt-16'>
        <div className='h-7 w-48 skeleton rounded' />
        <div className='mt-6 grid gap-8 sm:grid-cols-3'>
          {SUPPORT_CHANNEL_KEYS.map(channelKey => (
            <div key={channelKey}>
              <div className='h-5 w-28 skeleton rounded' />
              <div className='mt-2 h-4 w-full skeleton rounded' />
              <div className='mt-3 h-4 w-16 skeleton rounded' />
            </div>
          ))}
        </div>
      </MarketingContainer>

      <MarketingContainer width='prose' className='mt-16'>
        <div className='h-7 w-64 skeleton rounded' />
        <div className='mt-8 space-y-5'>
          {SUPPORT_FAQ_KEYS.map(faqKey => (
            <div key={faqKey} className='h-5 w-full skeleton rounded' />
          ))}
        </div>
      </MarketingContainer>

      <MarketingContainer width='prose' className='mt-16'>
        <div className='h-7 w-40 skeleton rounded' />
        <div className='mt-4 h-5 w-72 skeleton rounded' />
        <div className='mt-6 h-10 w-40 skeleton rounded-lg' />
      </MarketingContainer>
    </div>
  );
}
