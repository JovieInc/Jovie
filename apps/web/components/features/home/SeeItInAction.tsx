import { SeeItInActionCarousel } from './SeeItInActionCarousel';

export function SeeItInAction() {
  return (
    <>
      <hr
        className='mx-auto h-px max-w-lg border-0'
        style={{
          background:
            'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
        }}
      />
      <SeeItInActionCarousel />
    </>
  );
}
