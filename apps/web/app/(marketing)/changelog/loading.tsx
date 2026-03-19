import { Container } from '@/components/site/Container';

export default function ChangelogLoading() {
  return (
    <section
      className='py-16 md:py-24 min-h-screen'
      style={{
        backgroundColor: 'var(--linear-bg-footer)',
        color: 'var(--linear-text-primary)',
      }}
    >
      <Container>
        <header className='mb-12 md:mb-16 max-w-2xl'>
          <div className='h-10 w-48 skeleton rounded-lg' />
          <div className='mt-3 h-5 w-96 max-w-full skeleton rounded-lg' />
          <div className='mt-4 h-5 w-32 skeleton rounded-lg' />
        </header>

        <div className='max-w-3xl space-y-10'>
          {Array.from({ length: 4 }, (_, i) => `cl-skeleton-${i}`).map(key => (
            <div
              key={key}
              className='pl-6 border-l-2 border-white/10 space-y-3'
            >
              <div className='flex gap-2'>
                <div className='h-5 w-16 skeleton rounded-full' />
                <div className='h-5 w-24 skeleton rounded' />
              </div>
              <div className='space-y-2'>
                <div className='h-4 w-full skeleton rounded' />
                <div className='h-4 w-5/6 skeleton rounded' />
                <div className='h-4 w-3/4 skeleton rounded' />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
