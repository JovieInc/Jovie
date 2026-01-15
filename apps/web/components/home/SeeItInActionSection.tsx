import Image from 'next/image';
import { Container } from '@/components/site/Container';

const DEMO_ARTISTS = [
  {
    name: 'Billie Eilish',
    handle: 'billieeilish',
    image: '/images/avatars/billie-eilish.jpg',
  },
  {
    name: 'Dua Lipa',
    handle: 'dualipa',
    image: '/images/avatars/dua-lipa.jpg',
  },
  {
    name: 'The 1975',
    handle: 'the1975',
    image: '/images/avatars/the-1975.jpg',
  },
  {
    name: 'Taylor Swift',
    handle: 'taylorswift',
    image: '/images/avatars/taylor-swift.jpg',
  },
  {
    name: 'Ed Sheeran',
    handle: 'edsheeran',
    image: '/images/avatars/ed-sheeran.jpg',
  },
  {
    name: 'Lady Gaga',
    handle: 'ladygaga',
    image: '/images/avatars/lady-gaga.jpg',
  },
];

export function SeeItInActionSection() {
  return (
    <section className='section-spacing-linear bg-base border-t border-subtle'>
      <Container size='homepage'>
        <div className='text-center mb-12'>
          <h2 className='marketing-h2-linear mb-4'>See it in action</h2>
          <p className='marketing-lead-linear text-secondary-token'>
            What your profile could look like
          </p>
        </div>

        <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6'>
          {DEMO_ARTISTS.map(artist => (
            <div key={artist.handle} className='flex flex-col items-center'>
              <div className='relative w-20 h-20 mb-3'>
                <Image
                  src={artist.image}
                  alt={`${artist.name} example profile`}
                  fill
                  className='rounded-full object-cover border border-subtle'
                />
              </div>
              <p className='text-sm font-medium text-primary-token'>
                {artist.name}
              </p>
              <p className='text-xs text-tertiary-token'>@{artist.handle}</p>
            </div>
          ))}
        </div>

        <p className='text-center text-xs text-tertiary-token mt-8'>
          Demo profiles for illustration purposes
        </p>
      </Container>
    </section>
  );
}
