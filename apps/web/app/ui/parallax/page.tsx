import { ZoomParallax } from '@/components/ui/zoom-parallax';

const DEMO_IMAGES = [
  {
    src: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1280&h=720&q=80',
    alt: 'Modern glass building under a bright sky',
  },
  {
    src: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=1280&h=720&q=80',
    alt: 'City street at sunset with cars and tall buildings',
  },
  {
    src: 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=800&h=800&q=80',
    alt: 'Abstract geometric gradient artwork',
  },
  {
    src: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1280&h=720&q=80',
    alt: 'Mountain range under layered clouds',
  },
  {
    src: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&h=800&q=80',
    alt: 'Minimal abstract shapes with soft light',
  },
  {
    src: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=1280&h=720&q=80',
    alt: 'Ocean shoreline with moving waves',
  },
  {
    src: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1280&h=720&q=80',
    alt: 'Forest canopy with sunlight filtering through trees',
  },
] as const;

export default function ParallaxPage() {
  return (
    <div>
      <h1 className='mb-1 text-lg font-semibold text-primary-token'>
        Zoom Parallax
      </h1>
      <p className='mb-8 text-[13px] text-tertiary-token'>
        Scroll-driven image collage powered by a lightweight DOM animation loop
        and Next.js image optimization.
      </p>

      <div className='w-full'>
        <div className='relative flex h-[50vh] items-center justify-center overflow-hidden rounded-xl bg-surface-1 px-6'>
          <div
            aria-hidden='true'
            className='pointer-events-none absolute left-1/2 top-1/2 h-[120vmin] w-[120vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.14),transparent_55%)] blur-3xl'
          />
          <div className='relative max-w-2xl text-center'>
            <p className='text-balance text-4xl font-semibold tracking-tight text-primary-token'>
              Scroll down to watch the image stack expand.
            </p>
          </div>
        </div>

        <ZoomParallax className='mt-8' images={DEMO_IMAGES} />
        <div className='h-[35vh]' />
      </div>
    </div>
  );
}
