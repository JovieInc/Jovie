const HomePage = () => {
  return (
    <main className='mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-16'>
      <p className='text-sm font-medium uppercase tracking-[0.2em] text-neutral-500'>
        Jovie Docs
      </p>
      <h1 className='mt-4 text-balance text-4xl font-semibold tracking-tight text-neutral-900'>
        Documentation scaffolding is live.
      </h1>
      <p className='mt-5 text-pretty text-lg leading-8 text-neutral-600'>
        We selected Nextra 4 as our docs framework for native Next.js alignment,
        low maintenance overhead, and strong monorepo ergonomics. Content
        migration follows the feature registry work in JOV-962.
      </p>
    </main>
  );
};

export default HomePage;
